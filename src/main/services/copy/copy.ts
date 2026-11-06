import { copyFile, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

import type {
  CopyFailure,
  CopyPlanPreview,
  CopyProgress,
  CopyTask,
  CopyTaskParams,
  ScannedImage,
} from '../../../shared/ipc'

import { isFinalCopyStatus } from '../../../shared/ipc'
import { createAdaptiveGate } from '../../utils/adaptive'
import type { AdaptiveGate } from '../../utils/adaptive'
import { toFsPath } from '../../utils/pathx'
import { logger } from '../log'
import { cachedSizeOf, measureImageSizes } from './measure'
import { buildCopyPlan, folderOf, selectCopyImages } from './plan'
import type { PlanItem } from './plan'

// 计划相关的纯函数仍从这里导出，IPC 与测试的 import 路径不变
export {
  buildCopyPlan,
  filterByMachines,
  folderOf,
  machineOf,
  selectCopyImages,
  typeOf,
} from './plan'
export type { CopyPlan, PlanAction, PlanItem } from './plan'

/**
 * 同时打开的文件句柄上限。现场机器 8G 内存，10 路并发复制 +
 * 每个目标先 stat 一次会瞬时占用 20 个句柄，遇到网络盘共享冲突就开始失败，
 * 所以降到 6，并以每批 50 个文件的粒度推进。
 */
export const DEFAULT_COPY_CONCURRENCY = 6

/** 每批复制的文件数：批与批之间让出事件循环，进度也能按批反馈 */
export const DEFAULT_COPY_BATCH_SIZE = 50

const PROGRESS_INTERVAL_MS = 120

/**
 * 文件之间没有进度事件时，也按秒推一次快照。
 *
 * 一个几百 MB 的文件 copyFile 期间不会回调，如果只在文件完成时 touch，
 * 界面上的「已用 / 剩余 / 预计完成 / 网速」会整段冻住，看起来像卡死。
 */
const PROGRESS_TICK_MS = 1000

/** 实时网速的滑动窗口：只统计最近 5 秒的字节增量 */
const SPEED_WINDOW_MS = 5000
/** 采样间隔：没必要每个 120ms 事件都记一个点 */
const SPEED_SAMPLE_MS = 250

const MANIFEST_NAME = 'source.txt'

export interface CopyLoadOptions {
  concurrency?: number
  batchSize?: number
}

const abortError = (): Error => {
  const error = new Error('复制已取消')
  error.name = 'AbortError'
  return error
}

const isAbortError = (error: unknown): boolean =>
  error instanceof Error && error.name === 'AbortError'

/**
 * 滑动窗口测速。
 *
 * 累计平均速度在长任务里几乎不动：刚开始慢、后来快，界面上的数字要很久
 * 才追上；暂停十分钟再继续又会被摊薄。这里只看最近几秒的字节增量。
 *
 * 窗口内不足两个采样点（刚启动、或长时间没有新字节）返回 0，
 * 让界面显示「计算中 / 0」而不是一个过时的旧值。
 */
export class SpeedMeter {
  private samples: { at: number; bytes: number }[] = []
  private last = 0
  private readonly windowMs: number
  private readonly sampleMs: number

  constructor(windowMs = SPEED_WINDOW_MS, sampleMs = SPEED_SAMPLE_MS) {
    this.windowMs = windowMs
    this.sampleMs = sampleMs
  }

  reset(at = Date.now(), bytes = 0): void {
    this.samples = [{ at, bytes }]
    this.last = 0
  }

  value(now: number, bytes: number): number {
    const last = this.samples[this.samples.length - 1]

    if (!last || now - last.at >= this.sampleMs) {
      this.samples.push({ at: now, bytes })
    }

    const cutoff = now - this.windowMs

    while (this.samples.length > 1 && this.samples[0].at < cutoff) {
      this.samples.shift()
    }

    if (this.samples.length < 2) {
      this.last = 0
      return 0
    }

    const first = this.samples[0]
    const span = now - first.at

    if (span <= 0) return this.last

    this.last = Math.max(0, Math.round(((bytes - first.bytes) / span) * 1000))

    return this.last
  }
}

/** 预检查：让界面在选目录前就能告诉用户会复制多少、建几个文件夹 */
export const planPreview = async (
  images: ScannedImage[],
  params: CopyTaskParams,
  targetDir?: string,
): Promise<CopyPlanPreview> => {
  // 计划与执行共用 buildCopyPlan：张数、机台、冲突数都来自同一遍判定
  const plan = await buildCopyPlan({ images, params, targetDir })

  // 体积用于「要复制的机台」标题行，让用户在点开始前就知道这批图多大；
  // 命中缓存的项不再打网络 IO，第一次勾选的代价才是一次 stat。
  // 刻意留在计划之外：执行时要量的只是 action === 'copy' 的项。
  const sizes = await measureImageSizes(plan.picked)

  return {
    machines: plan.perMachine.map((item) => item.machine),
    total: plan.picked.length,
    perMachine: plan.perMachine,
    folders: plan.folders,
    conflicts: plan.conflicts,
    totalBytes: sizes.totalBytes,
    sizeUnknown: sizes.sizeUnknown,
  }
}

export interface CopyRunnerOptions {
  scanTaskId: string
  targetDir: string
  params: CopyTaskParams
  images: ScannedImage[]
  emit: (task: CopyTask) => void
  load?: CopyLoadOptions
}

/**
 * 一次复制任务的执行体。
 *
 * 与扫描任务的差异：复制是逐文件 IO，单个文件失败不该中断整批，
 * 所以失败只记录不抛出；而暂停/取消要在文件之间生效，不能等整批跑完。
 */
export class CopyTaskRunner {
  readonly id = crypto.randomUUID()
  /** 创建时间，任务表按它淘汰最老的已结束任务 */
  readonly createdAt = Date.now()
  scanTaskId: string
  targetDir: string
  private params: CopyTaskParams

  private readonly source: ScannedImage[]
  private readonly emit: (task: CopyTask) => void
  private concurrency: number
  private readonly batchSize: number
  /** 失败率采样器，与扫描共用同一套降档逻辑 */
  private readonly gate: AdaptiveGate

  private status: CopyTask['status'] = 'pending'
  private error: string | null = null
  private manifestPath: string | null = null

  private plan: PlanItem[] = []
  private cursor = 0
  private copied = 0
  private renamed = 0
  private skipped = 0
  private alreadyExists = 0
  /**
   * 本轮参与判定的图片总数：包含目标已存在、源内重名跳过的项。
   *
   * 不能用 plan.length 当分母：skip-exists 的项不进 plan，但确实处理过了。
   * 早先的公式是「done 含 alreadyExists、total 只算 plan」，全部跳过时会
   * 显示成「已完成 9 / 0 张」。
   */
  private roundTotal = 0
  /** 本轮真正要写盘的文件数 */
  private copyTotal = 0
  private totalBytes = 0
  private copiedBytes = 0
  private failedBytes = 0
  private sizeUnknown = 0
  private failures: CopyFailure[] = []
  private currentPath = ''
  private startedAt: number | null = null
  private finishedAt: number | null = null
  private lastEmitAt = 0
  /** 最近几秒的字节采样，用于实时网速 */
  private readonly speed = new SpeedMeter()
  /** 运行中按秒推快照，让进度信息在长文件复制期间也能刷新 */
  private ticker: ReturnType<typeof setInterval> | null = null

  /**
   * 是否已经规划过。
   *
   * 不能再用 plan.length 判断「首次执行」：重试失败项时 plan 是失败子集，
   * 若失败项恰好为 0（全部被跳过），plan 也是空，会被误判成首次执行并
   * 重跑 buildPlan，把「只重试失败项」变成「全量重跑」。
   */
  private planned = false

  private paused = false
  /** 暂停累计时长与本次暂停起点，用于算真实吞吐（不含暂停） */
  private pausedMs = 0
  private pausedAt: number | null = null
  private resumeWaiters: (() => void)[] = []
  /**
   * 每次 run 重新创建：取消过的信号会一直是 aborted，
   * 重试时沿用它会让任务一启动就自己取消。
   */
  private abortController = new AbortController()
  /**
   * 本轮执行的终态信号。
   *
   * 不能只在构造时建一次：Promise 一旦 resolve 就永远保持 resolved，
   * 重试之后 waitSettled() 会立刻返回，调用方以为新的一轮已经跑完。
   * 所以每次 run() 都换一个新的。
   */
  private settled: Promise<void> = Promise.resolve()
  private markSettled: () => void = () => {}

  constructor(options: CopyRunnerOptions) {
    this.scanTaskId = options.scanTaskId
    this.targetDir = options.targetDir
    this.params = options.params
    this.source = options.images
    this.emit = options.emit
    this.concurrency = Math.max(
      1,
      Math.floor(options.load?.concurrency ?? DEFAULT_COPY_CONCURRENCY),
    )
    this.batchSize = Math.max(
      1,
      Math.floor(options.load?.batchSize ?? DEFAULT_COPY_BATCH_SIZE),
    )

    this.gate = createAdaptiveGate({
      initial: this.concurrency,
      min: 1,
      onChange: (concurrency, ratio) => {
        this.concurrency = concurrency

        console.warn(
          `复制失败率 ${(ratio * 100).toFixed(0)}%，并发降至 ${concurrency}`,
        )
        logger.warn('copy', 'copy.concurrency.downgrade', {
          copyId: this.id,
          ratio,
          concurrency,
        })

        this.touch('', true)
      },
    })

    this.resetSettled()
  }

  // ---------------------------------------------------------------- 对外操作

  start(): CopyTask {
    if (this.status !== 'pending') return this.snapshot()

    this.status = 'running'
    this.startedAt = Date.now()
    this.speed.reset(this.startedAt, this.copiedBytes)
    this.startTicker()

    logger.info('copy', 'copy.start', {
      copyId: this.id,
      scanTaskId: this.scanTaskId,
      targetDir: this.targetDir,
      layout: this.params.layout,
      conflict: this.params.conflict,
      machines: this.params.machines.length,
      images: this.source.length,
      concurrency: this.concurrency,
      batchSize: this.batchSize,
    })

    this.touch('', true)
    void this.run()

    return this.snapshot()
  }

  pause(): CopyTask {
    if (this.status !== 'running') return this.snapshot()

    this.paused = true
    this.pausedAt = Date.now()
    this.status = 'paused'
    this.stopTicker()

    logger.info('copy', 'copy.pause', {
      copyId: this.id,
      copied: this.copied,
      failed: this.failures.length,
      skipped: this.skipped,
      alreadyExists: this.alreadyExists,
    })

    this.touch('', true)

    return this.snapshot()
  }

  resume(): CopyTask {
    if (this.status !== 'paused') return this.snapshot()

    if (this.pausedAt !== null) {
      this.pausedMs += Date.now() - this.pausedAt
      this.pausedAt = null
    }

    this.paused = false
    this.status = 'running'
    // 暂停期间没有字节流动，重新开始计时，别把暂停时长摊进网速
    this.speed.reset(Date.now(), this.copiedBytes)
    this.startTicker()

    logger.info('copy', 'copy.resume', {
      copyId: this.id,
      pausedMs: this.pausedMs,
    })

    for (const resolve of this.resumeWaiters.splice(0)) resolve()

    this.touch('', true)

    return this.snapshot()
  }

  cancel(): CopyTask {
    if (this.isFinal()) return this.snapshot()

    if (this.pausedAt !== null) {
      this.pausedMs += Date.now() - this.pausedAt
      this.pausedAt = null
    }

    this.stopTicker()
    this.abortController.abort()
    this.paused = false

    for (const resolve of this.resumeWaiters.splice(0)) resolve()

    this.status = 'canceled'

    logger.info('copy', 'copy.cancel', {
      copyId: this.id,
      copied: this.copied,
      failed: this.failures.length,
      copiedBytes: this.copiedBytes,
    })

    this.touch('', true)

    return this.snapshot()
  }

  /** 只重试失败的图片；已成功的不会重来 */
  retry(): CopyTask {
    if (!this.isFinal()) return this.snapshot()
    if (!this.failures.length) return this.snapshot()

    logger.info('copy', 'copy.retry', {
      copyId: this.id,
      failures: this.failures.length,
      sample: this.failures.slice(0, 5).map((failure) => ({
        path: failure.path,
        reason: failure.reason,
      })),
    })

    // 从最初的源清单里找回原项，而不是拿 failure.path 反推：
    // path 与 name 是两回事（path 是展示用的相对路径，name 是文件名），
    // 用 path 反推会丢 machine 字段（按机台分组就建错目录）；
    // 而 from 在 Windows 上可能带尾随反斜杠，split 会切出空串。
    const byPath = new Map(this.source.map((item) => [item.absolutePath, item]))

    this.plan = this.failures.map((failure) => {
      const image = byPath.get(failure.from)
      // 失败时已经把分组目录记下来了，直接沿用；不能从绝对路径反推，
      // 否则盘符和目标目录会被当成子目录拼进下一次 createFolders。
      const fallbackImage: ScannedImage = image ?? {
        path: failure.path,
        absolutePath: failure.from,
        // 找不到原项时用真实文件名兜底，不能用 path 的末段
        name: basename(failure.from),
      }
      const folder =
        failure.folder ?? folderOf(fallbackImage, this.params.layout)

      return {
        image: fallbackImage,
        folder,
        from: failure.from,
        to: failure.to,
        renamed:
          basename(failure.to) !== (image?.name ?? basename(failure.from)),
        // 重试是明确要求「再写一次」，所以一律按复制处理，不做跳过判定
        action: 'copy',
      }
    })
    // 计划已经手工构造好，run() 不能再重跑 buildPlan
    this.planned = true
    this.cursor = 0
    this.copied = 0
    this.renamed = 0
    this.skipped = 0
    this.alreadyExists = 0
    this.roundTotal = this.plan.length
    this.copyTotal = this.plan.length
    this.totalBytes = 0
    this.copiedBytes = 0
    this.failedBytes = 0
    this.sizeUnknown = 0
    this.failures = []
    this.finishedAt = null
    this.error = null
    this.pausedMs = 0
    this.pausedAt = null
    this.status = 'running'
    this.startedAt = Date.now()
    this.speed.reset(this.startedAt, this.copiedBytes)
    this.startTicker()
    this.touch('', true)
    void this.run()

    return this.snapshot()
  }

  snapshot(): CopyTask {
    return {
      id: this.id,
      scanTaskId: this.scanTaskId,
      status: this.status,
      progress: this.progress(),
      error: this.error,
      // 失败明细带上限：几万条全塞进 IPC 会拖垮渲染层。
      // 批量失败通常发生在网络断开，前 200 条足够定位问题。
      failures: this.failures.slice(0, 200),
      manifestPath: this.manifestPath,
    }
  }

  isFinal(): boolean {
    return isFinalCopyStatus(this.status)
  }

  waitSettled(): Promise<void> {
    return this.settled
  }

  /** 换一个新的终态 promise，供下一轮 run() 使用 */
  private resetSettled(): void {
    this.settled = new Promise<void>((resolve) => {
      this.markSettled = resolve
    })
  }

  // ---------------------------------------------------------------- 执行主体

  private progress(): CopyProgress {
    const total = this.roundTotal
    // 跳过的也是「处理完了」：它已经比对过目标目录并做出了决定，
    // 只是没落盘。分母用 roundTotal（含已存在/源内重名跳过），
    // 分子也包含它们，完成时两边才能对上。
    const done =
      this.copied + this.failures.length + this.skipped + this.alreadyExists
    // 吞吐不算暂停：用户暂停十分钟再继续，不该把速度摊薄成接近 0
    const activePausedMs =
      this.pausedMs + (this.pausedAt !== null ? Date.now() - this.pausedAt : 0)
    const elapsed = Math.max(
      0,
      (this.finishedAt ?? Date.now()) -
        (this.startedAt ?? Date.now()) -
        activePausedMs,
    )
    const ratio = total > 0 ? Math.min(1, done / total) : 0
    const batchTotal =
      this.copyTotal > 0 ? Math.ceil(this.copyTotal / this.batchSize) : 0
    const batchDone = this.copied + this.failures.length
    const averageBytesPerSecond =
      elapsed > 0 ? Math.round((this.copiedBytes / elapsed) * 1000) : 0
    // 运行中显示最近 5 秒的实时速度；终态/暂停给出整轮平均，供界面标注「平均网速」
    const bytesPerSecond =
      this.status === 'running'
        ? this.speed.value(Date.now(), this.copiedBytes)
        : averageBytesPerSecond
    // 窗口刚开始时还没有样本，ETA 仍有累计平均可用
    const etaSpeed = bytesPerSecond > 0 ? bytesPerSecond : averageBytesPerSecond

    // 有完整字节信息时优先按字节估剩余；否则回退到按张数
    let etaMs: number | null = null

    if (this.status === 'running' && ratio < 1) {
      const remainingBytes =
        this.totalBytes - this.copiedBytes - this.failedBytes

      if (
        this.sizeUnknown === 0 &&
        remainingBytes > 0 &&
        etaSpeed > 0 &&
        elapsed >= 3000
      ) {
        etaMs = Math.round((remainingBytes / etaSpeed) * 1000)
      } else if (ratio >= 0.03) {
        // 张数回退：3% 以后估算才稳，又比原来的 10% 更早给出预期
        etaMs = Math.round((elapsed / ratio) * (1 - ratio))
      }
    }

    return {
      status: this.status,
      copied: this.copied,
      total,
      copyTotal: this.copyTotal,
      failed: this.failures.length,
      batchIndex:
        batchTotal > 0
          ? Math.min(
              Math.max(1, Math.ceil(batchDone / this.batchSize)),
              batchTotal,
            )
          : 0,
      batchTotal,
      targetDir: this.targetDir,
      layout: this.params.layout,
      renamed: this.renamed,
      skipped: this.skipped,
      alreadyExists: this.alreadyExists,
      conflict: this.params.conflict ?? 'rename',
      totalBytes: this.totalBytes,
      copiedBytes: this.copiedBytes,
      failedBytes: this.failedBytes,
      bytesPerSecond,
      sizeUnknown: this.sizeUnknown,
      currentPath: this.currentPath,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      pausedMs: activePausedMs,
      elapsedMs: elapsed,
      etaMs,
    }
  }

  private async run(): Promise<void> {
    // 新一轮执行必须用干净的中断信号，否则「取消后再重试」会秒退
    this.abortController = new AbortController()
    this.resetSettled()

    try {
      // 只有从未规划过才做规划；重试时 plan 已是失败项的子集，
      // 重试后 planned 保持 true，空计划直接结束
      if (!this.planned) {
        this.planned = true
        await this.buildPlan()
      }

      if (!this.plan.length) {
        // 全部被跳过时也得走完收尾：清单是「这次要复制哪些图」的凭据，
        // 跳过一张不写，用户事后无法核对到底点了哪些机台。
        await this.writeManifest()
        this.finish('completed')

        return
      }

      // 先量一遍源文件大小：后面的总大小、吞吐与字节 ETA 都靠它。
      // stat 失败不影响复制，只是该文件按大小未知处理。
      await this.measurePlan()
      await this.writeManifest()
      await this.createFolders()
      await this.copyAll()

      this.finish('completed')
    } catch (error) {
      if (isAbortError(error)) {
        this.finish('canceled')
      } else {
        this.error = (error as Error)?.message ?? '复制过程中发生未知错误'
        logger.error('copy', 'copy.run.failed', {
          copyId: this.id,
          error,
        })
        this.finish('failed')
      }
    }
  }

  private finish(status: CopyTask['status']): void {
    this.stopTicker()
    this.finishedAt = Date.now()
    this.status = status
    this.currentPath = ''

    logger.info('copy', 'copy.end', {
      copyId: this.id,
      status,
      copied: this.copied,
      copyTotal: this.copyTotal,
      failed: this.failures.length,
      skipped: this.skipped,
      alreadyExists: this.alreadyExists,
      renamed: this.renamed,
      totalBytes: this.totalBytes,
      copiedBytes: this.copiedBytes,
      failedBytes: this.failedBytes,
      elapsedMs: this.finishedAt - (this.startedAt ?? this.finishedAt),
      error: this.error,
    })

    if (status === 'failed') {
      logger.error('copy', 'copy.failed', {
        copyId: this.id,
        error: this.error,
      })
    }

    this.touch('', true)
    this.markSettled()
  }

  /** 本次任务应复制的完整图片集合；清单从这里取 */
  private taskImages(): ScannedImage[] {
    return selectCopyImages(this.source, this.params.machines)
  }

  /** 规划目标路径：按布局建子目录，按重名策略决定改名 / 跳过 / 覆盖 */
  private async buildPlan(): Promise<void> {
    // 与复制面板的预检查共用同一次判定：预览说几张、冲突几个，
    // 执行时就是同样的结果
    const built = await buildCopyPlan({
      images: this.source,
      params: this.params,
      targetDir: this.targetDir,
    })

    this.plan = built.items
    this.roundTotal = built.picked.length
    this.copyTotal = built.copyTotal
    this.alreadyExists = built.alreadyExists

    logger.info('copy', 'copy.plan', {
      copyId: this.id,
      planned: this.roundTotal,
      copyTotal: this.copyTotal,
      alreadyExists: this.alreadyExists,
      skipped: this.plan.filter((item) => item.action === 'skip').length,
      renamed: this.plan.filter((item) => item.renamed).length,
    })
  }

  /**
   * 量一遍待复制源文件的大小。
   *
   * 只 stat 真正要写盘的项；跳过项不落盘，没必要为它们跑网络 IO。
   * 失败只记 sizeUnknown，不能让 stat 问题阻断复制本身。
   */
  private async measurePlan(): Promise<void> {
    const items = this.plan.filter((item) => item.action === 'copy')

    this.totalBytes = 0
    this.sizeUnknown = 0

    // 极端大任务不在开跑前逐张 stat：几千次网络往返会让「开始复制」
    // 看起来像卡住。此时展示层回退为按张数估算。
    if (items.length > 5000) {
      this.sizeUnknown = items.length

      logger.info('copy', 'copy.measure', {
        copyId: this.id,
        items: items.length,
        totalBytes: 0,
        sizeUnknown: this.sizeUnknown,
        skippedStat: true,
      })

      return
    }

    await this.pool(items, async (item) => {
      // 预检查已经量过的项直接命中缓存，不再为同一批文件重复打网络 IO
      const size = await cachedSizeOf(item.from)

      if (size === null) {
        // 源文件不可读时复制本来就会失败，大小按未知处理即可
        this.sizeUnknown += 1
        return
      }

      item.size = size
      this.totalBytes += size
    })

    logger.info('copy', 'copy.measure', {
      copyId: this.id,
      items: items.length,
      totalBytes: this.totalBytes,
      sizeUnknown: this.sizeUnknown,
    })
  }

  private async createFolders(): Promise<void> {
    const folders = new Set(
      this.plan.map((item) => item.folder.join('/')).filter(Boolean),
    )

    for (const folder of folders) {
      const dir = join(this.targetDir, ...folder.split('/'))

      try {
        await mkdir(toFsPath(dir), { recursive: true })
        logger.debug('copy', 'copy.folder.created', {
          copyId: this.id,
          dir,
        })
      } catch (error) {
        logger.error('copy', 'copy.folder.create.failed', {
          copyId: this.id,
          dir,
          error,
        })
        throw new Error(
          `无法创建目录「${dir}」：${(error as Error)?.message ?? '未知错误'}`,
        )
      }
    }
  }

  /**
   * 清单写在目标目录根下，内容是参与这次复制的相对路径。
   * 分组复制时也放根下 —— 跟着某个机台子目录走会让用户找不到。
   */
  private async writeManifest(): Promise<void> {
    const target = join(this.targetDir, MANIFEST_NAME)
    // 清单永远取任务完整图片集合，不取 this.plan：
    // 重试失败项时 plan 只剩失败子集，不能让它覆盖掉全量清单
    const images = this.taskImages()

    const temp = `${target}.${process.pid}.tmp`

    try {
      await mkdir(toFsPath(this.targetDir), { recursive: true })
      await writeFile(
        toFsPath(temp),
        images.map((image) => image.path).join('\n'),
        'utf-8',
      )
      await rename(toFsPath(temp), toFsPath(target))
      this.manifestPath = target

      logger.info('copy', 'copy.manifest', {
        copyId: this.id,
        path: target,
        images: images.length,
      })
    } catch (error) {
      // 清单只是辅助信息，写不进去不该让整次复制失败
      await rm(toFsPath(temp), { force: true }).catch(() => undefined)
      this.manifestPath = null
      logger.warn('copy', 'copy.manifest.failed', {
        copyId: this.id,
        target,
        error,
      })
    }
  }

  private async copyAll(): Promise<void> {
    // 规划阶段就已经决定跳过的项（目标已存在 / 源内重名）在这里一次性结清：
    // 它们不碰磁盘，没必要占用并发通道。以前它们混在 plan 里交给 copyOne，
    // 而 copyOne 一进来就 return，pool 的 next 游标与批号推进节奏对不上，
    // 极端情况下还会让「全部跳过」变成 0/0 的进度。
    for (const item of this.plan) {
      if (item.action === 'skip') this.skipped += 1
    }

    const work = this.plan.filter((item) => item.action === 'copy')
    const total = work.length
    this.copyTotal = total

    logger.info('copy', 'copy.all.start', {
      copyId: this.id,
      work: total,
      totalBytes: this.totalBytes,
      concurrency: this.concurrency,
      batchSize: this.batchSize,
    })

    this.touch('', true)

    // 外层按批推进只为让 progress 的批号有意义，真正的并发控制交给 pool
    while (this.cursor < total) {
      const batchEnd = Math.min(this.cursor + this.batchSize, total)
      const batch = work.slice(this.cursor, batchEnd)

      await this.pool(batch, (item) => this.copyOne(item))

      this.cursor = batchEnd

      logger.debug('copy', 'copy.batch.end', {
        copyId: this.id,
        cursor: this.cursor,
        total,
        copied: this.copied,
        failed: this.failures.length,
        copiedBytes: this.copiedBytes,
      })

      this.touch('', true)
    }
  }

  private async copyOne(item: PlanItem): Promise<void> {
    await this.checkpoint()

    // 走到这里的只可能是 action === 'copy'；跳过项在 copyAll 里已结清
    this.currentPath = item.to
    const startedAt = Date.now()

    try {
      await copyFile(toFsPath(item.from), toFsPath(item.to))

      this.copied += 1
      this.copiedBytes += item.size ?? 0
      if (item.renamed) this.renamed += 1
      this.gate.sample(false)

      logger.debug('copy', 'copy.file.ok', () => ({
        copyId: this.id,
        from: item.from,
        to: item.to,
        bytes: item.size,
        ms: Date.now() - startedAt,
        renamed: item.renamed,
      }))
    } catch (error) {
      // 源文件被占用、权限不足、磁盘满等：记录后继续，不中断整批；
      // 但取消要立刻传播，不能被当成普通失败吞掉
      if (isAbortError(error)) throw error

      this.failedBytes += item.size ?? 0
      this.failures.push({
        path: item.image.path,
        from: item.from,
        to: item.to,
        // 重试时靠它还原分组目录，不再从绝对路径反推
        folder: item.folder,
        reason: (error as Error)?.message ?? '未知错误',
      })

      logger.warn('copy', 'copy.file.failed', {
        copyId: this.id,
        from: item.from,
        to: item.to,
        bytes: item.size,
        ms: Date.now() - startedAt,
        reason: (error as Error)?.message ?? '未知错误',
        error,
      })

      // 失败率过高时降档：共享盘抖动下越并发越糟
      this.gate.sample(true)
    } finally {
      // 文件刚写完，把字节增量立刻记进窗口，网速不用等下一次心跳
      this.speed.value(Date.now(), this.copiedBytes)
      this.touch(item.to)
    }
  }

  /** 运行中每秒推一次快照；暂停/取消/结束时必须停掉，否则会一直发事件 */
  private startTicker(): void {
    if (this.ticker) return

    this.ticker = setInterval(() => {
      if (this.status !== 'running') return

      this.speed.value(Date.now(), this.copiedBytes)
      this.touch('', true)
    }, PROGRESS_TICK_MS)

    // 不让计时器拖住进程退出；Electron 主进程里 Timeout 有 unref
    this.ticker.unref?.()
  }

  private stopTicker(): void {
    if (!this.ticker) return

    clearInterval(this.ticker)
    this.ticker = null
  }

  private touch(currentPath: string, force = false): void {
    if (currentPath) this.currentPath = currentPath

    const now = Date.now()
    if (!force && now - this.lastEmitAt < PROGRESS_INTERVAL_MS) return

    this.lastEmitAt = now
    this.emit(this.snapshot())
  }

  /** 暂停/取消检查点：遍历待办项与每个文件粘贴前都会经过这里 */
  private async checkpoint(): Promise<void> {
    if (this.abortController.signal.aborted) throw abortError()

    while (this.paused) {
      await new Promise<void>((resolve) => {
        this.resumeWaiters.push(resolve)
      })
    }

    if (this.abortController.signal.aborted) throw abortError()
  }

  /**
   * 带并发上限执行，支持中途暂停。
   *
   * 不用「每批 slice + Promise.all」：那样暂停只能在批与批之间生效，
   * 一批 50 个文件要等一整批跑完才停，用户会以为暂停坏了。
   * 这里改成「谁先空出来谁领下一个」，暂停时立刻停止派发新任务，
   * 已在途的文件跑完后计数冻结。
   */
  private async pool(
    items: PlanItem[],
    worker: (item: PlanItem) => Promise<void>,
  ): Promise<void> {
    let next = 0

    const lanes = Array.from(
      { length: Math.min(this.concurrency, items.length) },
      async () => {
        while (true) {
          // checkpoint 在暂停时会一直等到恢复，所以它之后不必再判 paused；
          // 号必须紧接着同步领走 —— 两条 lane 同时等完 checkpoint 再判越界
          // 和取号，会出现两个 lane 取到同一个号甚至越界，worker 拿到
          // undefined。以前 stat 放在 try 里把这个问题吞成了「大小未知」。
          await this.checkpoint()

          if (next >= items.length) return

          const index = next
          next += 1

          await worker(items[index])
        }
      },
    )

    await Promise.all(lanes)
  }
}
