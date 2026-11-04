import { copyFile, mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'

import type {
  CopyFailure,
  CopyLayout,
  CopyPlanPreview,
  CopyProgress,
  CopyTask,
  CopyTaskParams,
  ScannedImage,
} from '../../../shared/ipc'

import { createAdaptiveGate } from '../../utils/adaptive'
import type { AdaptiveGate } from '../../utils/adaptive'
import { toFsPath } from '../../utils/pathx'
import { isImageFile } from '../scanner/imageFiles'

/**
 * 同时打开的文件句柄上限。现场机器 8G 内存，10 路并发复制 +
 * 每个目标先 stat 一次会瞬时占用 20 个句柄，遇到网络盘共享冲突就开始失败，
 * 所以降到 6，并以每批 50 个文件的粒度推进。
 */
export const DEFAULT_COPY_CONCURRENCY = 6

/** 每批复制的文件数：批与批之间让出事件循环，进度也能按批反馈 */
export const DEFAULT_COPY_BATCH_SIZE = 50

const PROGRESS_INTERVAL_MS = 120

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
 * 把文件名拆成「主名 + 末尾数字 + 扩展名」，用于数字自增。
 *
 * img.jpg      → { base: 'img',   index: null }
 * img1.jpg     → { base: 'img',   index: 1 }
 * shot_007.jpg → { base: 'shot_', index: 7 }  → 007 补零宽度保留
 */
const splitIndex = (
  name: string,
): { base: string; index: number | null; width: number; ext: string } => {
  const ext = extname(name)
  const stem = basename(name, ext)
  const match = stem.match(/^(.*?)(\d+)$/)

  if (!match) return { base: stem, index: null, width: 0, ext }

  const digits = match[2]

  return {
    base: match[1],
    index: Number.parseInt(digits, 10),
    width: digits.length,
    ext,
  }
}

/**
 * 生成不冲突的目标文件名：纯数字自增，直接拼在主名后面。
 *
 * img.jpg → img1.jpg → img2.jpg
 * img1.jpg 重名 → img2.jpg（拆开已有数字递增，不会得到 img11.jpg）
 *
 * Windows 文件名大小写不敏感，比较统一转小写，避免 a.jpg 与 A.jpg 互相覆盖。
 * 刻意不识别旧版本生成的「img (2).jpg」——跨版本重跑时它会当成另一个文件。
 */
const indexedName = (name: string, taken: Set<string>): string => {
  if (!taken.has(name.toLowerCase())) return name

  const { base, index, width, ext } = splitIndex(name)
  const start = (index ?? 0) + 1

  for (let next = start; next < start + 100_000; next += 1) {
    const digits = width > 1 ? String(next).padStart(width, '0') : String(next)
    const candidate = `${base}${digits}${ext}`

    if (!taken.has(candidate.toLowerCase())) return candidate
  }

  // 极端情况（同名上万份）：退回时间戳，绝不覆盖已有文件
  return `${base}${Date.now()}${ext}`
}

const segmentsOf = (image: ScannedImage): string[] =>
  image.path.split('/').filter(Boolean)

/**
 * 从图片上取机台与类型。
 *
 * 机台优先用扫描时写进去的 machine 字段 —— 力禧特、利珀、森标 AOI 的 path 第 0 段是厂区，
 * 直接按段切会把整个厂区当成一台机器。老历史记录没有这个字段，退回第 0 段
 * （那时的记录全是 EL 的，第 0 段就是机台目录名）。
 *
 * 类型取倒数第 2 段，各类扫描都一样。
 */
export const machineOf = (image: ScannedImage): string =>
  image.machine ?? segmentsOf(image)[0] ?? ''

export const typeOf = (image: ScannedImage): string => {
  const segments = segmentsOf(image)
  return segments.length >= 2 ? segments[segments.length - 2] : ''
}

/**
 * 按分组方式算出图片相对目标目录的子目录。
 * 完全平铺返回空数组，表示直接放进目标目录根下。
 */
export const folderOf = (image: ScannedImage, layout: CopyLayout): string[] => {
  switch (layout) {
    case 'flat':
      return []
    case 'machine':
      return [machineOf(image)]
    case 'type':
      return [typeOf(image)]
    case 'machine-type':
      return [machineOf(image), typeOf(image)]
  }
}

/** 过滤出勾选的机台；machines 为空表示全选 */
export const filterByMachines = (
  images: ScannedImage[],
  machines: string[],
): ScannedImage[] => {
  if (!machines.length) return images

  const allowed = new Set(machines)

  return images.filter((image) => allowed.has(machineOf(image)))
}

const compareName = (a: string, b: string): number =>
  a.localeCompare(b, 'zh-CN', { numeric: true })

/** 预检查：让界面在选目录前就能告诉用户会复制多少、建几个文件夹 */
export const planPreview = async (
  images: ScannedImage[],
  params: CopyTaskParams,
  targetDir?: string,
): Promise<CopyPlanPreview> => {
  // 只统计图片：界面给的是「将复制 N 张图」，不该把手工放进类型目录的
  // 说明文件、表格一起算进去。扫描侧已经按同一套扩展名过滤过，
  // 这里再挡一次是为了兼容从旧版历史里恢复的结果集。
  const picked = filterByMachines(images, params.machines).filter((image) =>
    isImageFile(image.name),
  )
  const perMachine = new Map<string, number>()
  const folders = new Set<string>()

  for (const image of picked) {
    const machine = machineOf(image)
    perMachine.set(machine, (perMachine.get(machine) ?? 0) + 1)

    const segments = folderOf(image, params.layout)
    if (segments.length) folders.add(segments.join('/'))
  }

  // 只有已经选好目录才可能算冲突数；没选目录时分组子目录还不存在
  const conflicts = targetDir
    ? await countConflicts(picked, params, targetDir)
    : 0

  return {
    machines: [...perMachine.keys()].sort(compareName),
    total: picked.length,
    perMachine: [...perMachine.entries()]
      .map(([machine, images]) => ({ machine, images }))
      .sort((a, b) => compareName(a.machine, b.machine)),
    folders: [...folders].sort(compareName),
    conflicts,
  }
}

/**
 * 预演一遍重名冲突：统计目标目录里**已经真实存在**的同名坑位数。
 *
 * 刻意不把「同一批里两张图同名」算进来 —— 那是源目录里的重名，
 * 用户在扫描结果里就能看到，提示「目标已存在」会让人误以为盘上已有文件。
 * 同名的一批图只占目标里的一个坑位，所以只算一次；覆盖确认弹窗用的就是这个数。
 */
const countConflicts = async (
  images: ScannedImage[],
  params: CopyTaskParams,
  targetDir: string,
): Promise<number> => {
  const takenByDir = new Map<string, Set<string>>()
  // 同一批同名图只占目标里的一个坑位，只能算一次：
  // 覆盖确认弹窗要报的是「会顶掉几个文件」，不是「涉及几张源图」。
  const seen = new Set<string>()
  let conflicts = 0

  for (const image of images) {
    const folder = folderOf(image, params.layout)
    const dir = folder.length ? join(targetDir, ...folder) : targetDir
    const taken = await namesIn(dir, takenByDir)
    const lower = image.name.toLowerCase()
    const key = `${dir}\u0000${lower}`

    if (taken.has(lower) && !seen.has(key)) {
      conflicts += 1
      seen.add(key)
    }
  }

  return conflicts
}

/** 取某目录的已占用名单，同一目录只读一次 */
const namesIn = async (
  dir: string,
  cache: Map<string, Set<string>>,
): Promise<Set<string>> => {
  const cached = cache.get(dir)

  if (cached) return cached

  const names = await existingNames(dir)
  cache.set(dir, names)

  return names
}

/** 读目标目录已有文件名；分组子目录还不存在时视为空 */
const existingNames = async (dir: string): Promise<Set<string>> => {
  try {
    const entries = await readdir(toFsPath(dir))

    return new Set(entries.map((name) => name.toLowerCase()))
  } catch {
    return new Set()
  }
}

/**
 * 单个待复制项的执行意图。
 *
 * - copy：真的写盘
 * - skip-exists：目标目录里已有同名文件，按「跳过已存在」策略跳过这一张
 * - skip：本批内部同名且策略为跳过（源目录里就有重名，无处可放）
 *
 * 前两种都不碰磁盘，但要分开计数：用户看「跳过 50 张」时需要知道
 * 是"盘上本来就有"还是"源里重了"。
 */
type PlanAction = 'copy' | 'skip' | 'skip-exists'

interface PlanItem {
  image: ScannedImage
  /** 相对目标目录的文件夹，空数组表示根下 */
  folder: string[]
  from: string
  to: string
  renamed: boolean
  action: PlanAction
  /** 源文件大小；拿不到时为 undefined，进度按张数回退 */
  size?: number
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
   * 重试或换目录重跑时沿用它会让任务一启动就自己取消。
   */
  private abortController = new AbortController()
  /**
   * 本轮执行的终态信号。
   *
   * 不能只在构造时建一次：Promise 一旦 resolve 就永远保持 resolved，
   * 重试 / 换目录之后 waitSettled() 会立刻返回，调用方以为新的一轮已经跑完。
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
    this.touch('', true)
    void this.run()

    return this.snapshot()
  }

  pause(): CopyTask {
    if (this.status !== 'running') return this.snapshot()

    this.paused = true
    this.pausedAt = Date.now()
    this.status = 'paused'
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

    this.abortController.abort()
    this.paused = false

    for (const resolve of this.resumeWaiters.splice(0)) resolve()

    this.status = 'canceled'
    this.touch('', true)

    return this.snapshot()
  }

  /** 只重试失败的图片；已成功的不会重来 */
  retry(): CopyTask {
    if (!this.isFinal()) return this.snapshot()
    if (!this.failures.length) return this.snapshot()

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
    this.touch('', true)
    void this.run()

    return this.snapshot()
  }

  /**
   * 换一个目标目录，按最初勾选的机台与分组方式完整重跑一次。
   *
   * 已经在跑的任务不允许改目录 —— 一半文件在 A 一半在 B，事后没人能说清。
   */
  retargetTo(targetDir: string): CopyTask {
    if (!this.isFinal()) {
      throw new Error('复制正在进行，请先取消再更换目标目录')
    }
    if (!targetDir.trim()) throw new Error('目标目录不能为空')
    if (targetDir === this.targetDir) return this.snapshot()

    this.targetDir = targetDir
    this.plan = []
    // 换了目录，旧计划里的 to 全部作废，必须重新规划
    this.planned = false
    this.cursor = 0
    this.copied = 0
    this.renamed = 0
    this.skipped = 0
    this.alreadyExists = 0
    this.roundTotal = 0
    this.copyTotal = 0
    this.totalBytes = 0
    this.copiedBytes = 0
    this.failedBytes = 0
    this.sizeUnknown = 0
    this.failures = []
    this.error = null
    this.manifestPath = null
    this.currentPath = ''
    this.finishedAt = null
    this.pausedMs = 0
    this.pausedAt = null
    this.startedAt = Date.now()
    this.status = 'running'
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
    return (
      this.status === 'completed' ||
      this.status === 'canceled' ||
      this.status === 'failed'
    )
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
    const bytesPerSecond =
      elapsed > 0 ? Math.round((this.copiedBytes / elapsed) * 1000) : 0

    // 有完整字节信息时优先按字节估剩余；否则回退到按张数
    let etaMs: number | null = null

    if (this.status === 'running' && ratio < 1) {
      const remainingBytes =
        this.totalBytes - this.copiedBytes - this.failedBytes

      if (
        this.sizeUnknown === 0 &&
        remainingBytes > 0 &&
        bytesPerSecond > 0 &&
        elapsed >= 3000
      ) {
        etaMs = Math.round((remainingBytes / bytesPerSecond) * 1000)
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
      elapsedMs: elapsed,
      etaMs,
    }
  }

  private async run(): Promise<void> {
    // 新一轮执行必须用干净的中断信号，否则「取消后再重试/换目录」会秒退
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
        this.finish('failed')
      }
    }
  }

  private finish(status: CopyTask['status']): void {
    this.finishedAt = Date.now()
    this.status = status
    this.currentPath = ''
    this.touch('', true)
    this.markSettled()
  }

  /** 本次任务应复制的完整图片集合；清单与执行计划都从这里取 */
  private taskImages(): ScannedImage[] {
    // 与 planPreview、扫描侧共用同一套扩展名判定：
    // 旧历史里若混入说明文件/表格，预览与真正复制的张数不能对不上。
    return filterByMachines(this.source, this.params.machines).filter((image) =>
      isImageFile(image.name),
    )
  }

  /** 规划目标路径：按布局建子目录，按重名策略决定改名 / 跳过 / 覆盖 */
  private async buildPlan(): Promise<void> {
    const picked = this.taskImages()
    const conflict = this.params.conflict ?? 'rename'
    this.roundTotal = picked.length

    // 三个名单各管一件事：
    // - original 是目标目录「开工前」的快照，用来判断这个名字是不是本来就存在
    // - taken 是本批累积占用，用来排队编号
    // - handled 记录本批里每个「目录 + 源文件名」出现过几次
    //
    // 合成一个名单会出事：A02-A 下 9 张图都叫 img.jpg，
    // 第 1 张复制过去后名字就被占住了，后面 8 张会被判成「目标已存在」——
    // skip 会把它们全部跳过（丢 8 张图），overwrite 会让它们互相覆盖（也丢 8 张）。
    //
    // 所以「目标开工前就有」与「本批刚写进去」必须分开看：
    // 前者按用户选的重名策略处理，后者只能编号，绝不能覆盖自己刚写的图。
    const original = new Map<string, Set<string>>()
    const taken = new Map<string, Set<string>>()
    const handled = new Map<string, Set<string>>()

    for (const image of picked) {
      const folder = folderOf(image, this.params.layout)
      const dir = folder.length
        ? join(this.targetDir, ...folder)
        : this.targetDir

      const existing = await namesIn(dir, original)

      let used = taken.get(dir)

      if (!used) {
        // 从原始快照复制一份，后续改的都是副本
        used = new Set(existing)
        taken.set(dir, used)
      }

      let seen = handled.get(dir)

      if (!seen) {
        seen = new Set()
        handled.set(dir, seen)
      }

      const lower = image.name.toLowerCase()
      const existedBefore = existing.has(lower)
      const repeated = seen.has(lower)

      seen.add(lower)

      let target = image.name
      let action: PlanAction = 'copy'

      // 三条判定互斥，顺序不能换：
      // 1) 目标开工前就有这个文件名 → 按用户选的策略走。skip 只跳这一张。
      //    以前这里是整组跳过，9 张 img.jpg 遇到 1 张已存在就丢 8 张。
      // 2) 本批内部重名（目标原本没有）→ 编号让开，skip 也跳。
      //    这一段保证 A02-A 下 9 张 img.jpg 不会互相覆盖，不能动。
      // 3) 其余照常复制。
      if (existedBefore && conflict === 'skip') {
        action = 'skip-exists'
      } else if (existedBefore && conflict === 'overwrite') {
        // 第一张顶掉目标文件，后面同名的编号落盘，否则 4 张最后只剩 1 张
        target = repeated ? indexedName(image.name, used) : image.name
      } else if (used.has(lower)) {
        if (conflict === 'skip') action = 'skip'
        else target = indexedName(image.name, used)
      }

      if (action === 'copy') used.add(target.toLowerCase())

      // 目标已存在而跳过的项不进 plan：它们不需要任何磁盘动作，
      // 混进 plan 只会把批号、进度和并发通道都算乱。
      if (action === 'skip-exists') {
        this.alreadyExists += 1
        continue
      }

      this.plan.push({
        image,
        folder,
        from: image.absolutePath,
        to: join(dir, target),
        renamed: target !== image.name,
        action,
      })
    }

    this.copyTotal = this.plan.filter((item) => item.action === 'copy').length
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
      return
    }

    await this.pool(items, async (item) => {
      try {
        const info = await stat(toFsPath(item.from))
        item.size = info.size
        this.totalBytes += info.size
      } catch {
        // 源文件不可读时复制本来就会失败，大小按未知处理即可
        this.sizeUnknown += 1
      }
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
      } catch (error) {
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

    try {
      await mkdir(toFsPath(this.targetDir), { recursive: true })
      await writeFile(
        toFsPath(target),
        images.map((image) => image.path).join('\n'),
        'utf-8',
      )
      this.manifestPath = target
    } catch {
      // 清单只是辅助信息，写不进去不该让整次复制失败
      this.manifestPath = null
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

    this.touch('', true)

    // 外层按批推进只为让 progress 的批号有意义，真正的并发控制交给 pool
    while (this.cursor < total) {
      const batchEnd = Math.min(this.cursor + this.batchSize, total)
      const batch = work.slice(this.cursor, batchEnd)

      await this.pool(batch, (item) => this.copyOne(item))

      this.cursor = batchEnd
      this.touch('', true)
    }
  }

  private async copyOne(item: PlanItem): Promise<void> {
    await this.checkpoint()

    // 走到这里的只可能是 action === 'copy'；跳过项在 copyAll 里已结清
    this.currentPath = item.to

    try {
      await copyFile(toFsPath(item.from), toFsPath(item.to))

      this.copied += 1
      this.copiedBytes += item.size ?? 0
      if (item.renamed) this.renamed += 1
      this.gate.sample(false)
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

      // 失败率过高时降档：共享盘抖动下越并发越糟
      this.gate.sample(true)
    } finally {
      this.touch(item.to)
    }
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
        while (next < items.length) {
          await this.checkpoint()

          // 暂停期间不领新活；恢复后接着从 next 走
          if (this.paused) continue

          const index = next
          next += 1

          await worker(items[index])
        }
      },
    )

    await Promise.all(lanes)
  }
}
