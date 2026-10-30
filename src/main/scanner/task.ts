import { join } from 'node:path'

import type {
  ScanBranch,
  ScanTask,
  ScanTaskParams,
  ScanTaskProgress,
  ScanTaskStatus,
  ScannedImage,
} from '../../shared/ipc'

import { isNetworkError, probePath, readDirSafe } from './fsx'
import type { DirReadResult } from './fsx'
import { createLimiter } from './limiter'
import type { Limiter } from './limiter'

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])

/**
 * 并发上限的默认值，按现场机器（8G 内存 + 256G 盘）定的保守档：
 * 每个并发读取在 Windows 上约占一个句柄 + 一条 SMB 请求，
 * 4 个在 8G 机器上既能压住网络等待，又不会把内存和句柄打满。
 */
export const DEFAULT_READ_CONCURRENCY = 4

/** 每批处理的机台数：一批跑完再开下一批，避免所有机台的状态同时压在内存里 */
export const DEFAULT_MACHINE_BATCH_SIZE = 2

/** 进度推送最小间隔，避免高频 IPC 压满渲染进程 */
const PROGRESS_INTERVAL_MS = 120

/** 连续不可达次数达到该值就怀疑网络盘断开，触发暂停而不是继续空转 */
const NETWORK_FAILURE_LIMIT = 5

/** 回传给渲染层的预览条数，全量结果留在主进程 */
const PREVIEW_LIMIT = 200

/** 探测阶段在进度条上占的权重，其余留给收图 */
const PROBE_WEIGHT = 20

/** 逐目录读文件明细占的权重 */
const DETAIL_WEIGHT = 30

/** 按固定大小切分数组，用于机台分批 */
const chunk = <T>(items: T[], size: number): T[][] => {
  const result: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size))
  }
  return result
}

/** 取绝对路径相对根目录的层级，用于生成结果里展示用的相对路径 */
const relativeSegments = (root: string, full: string): string[] =>
  full
    .slice(root.length)
    .split(/[\\/]+/)
    .filter(Boolean)

/** 自适应降档的采样窗口：每读够这么多个目录就看一眼失败率 */
const ADAPT_WINDOW = 20

/** 窗口内不可达占比超过该值就降档 */
const ADAPT_FAIL_RATIO = 0.25

/** 并发档位上下限 */
const MIN_CONCURRENCY = 1
const MAX_CONCURRENCY = 8
const MAX_BATCH_SIZE = 4

/** 单次读取超时的可调范围，随并发档位一起收紧 */
const MIN_TIMEOUT_MS = 8_000
export const MAX_TIMEOUT_MS = 20_000

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.round(value)))

/**
 * 并发越低，单次读取的容忍时间越短。
 * 并发 4 时给满 20 秒；降到 1 时只给 8 秒 —— 网络真断了就该尽快失败，
 * 而不是每读一个目录都空等 20 秒。
 */
const timeoutFor = (concurrency: number): number =>
  Math.round(
    MIN_TIMEOUT_MS +
      ((concurrency - MIN_CONCURRENCY) /
        (DEFAULT_READ_CONCURRENCY - MIN_CONCURRENCY || 1)) *
        (MAX_TIMEOUT_MS - MIN_TIMEOUT_MS),
  )

const isImageFile = (name: string): boolean => {
  const dot = name.lastIndexOf('.')
  return dot > 0 && IMAGE_EXTENSIONS.has(name.slice(dot).toLowerCase())
}

/** 期望值过长时截断，避免提示文案撑满面板 */
const summarize = (values: string[], max = 6): string =>
  values.length === 0
    ? '（空目录）'
    : values.length > max
      ? `${values.slice(0, max).join('、')} 等 ${values.length} 项`
      : values.join('、')

const abortError = (): Error => {
  const error = new Error('任务已取消')
  error.name = 'AbortError'
  return error
}

const isAbortError = (error: unknown): boolean =>
  error instanceof Error && error.name === 'AbortError'

export interface TaskContext {
  /** DC 根目录的原始 UNC 路径 */
  rootPath: string
  /** 工序层目录名，如 EL */
  entry: string
  /** 并发与分批参数，缺省走现场机器的保守档 */
  load?: LoadOptions
}

/** 现场机器资源有限，读写强度集中在这里调 */
export interface LoadOptions {
  /** 同时进行的目录读取数 */
  readConcurrency?: number
  /** 每批并行处理的机台数 */
  machineBatchSize?: number
}

const emptyProgress = (): ScanTaskProgress => ({
  phase: 'probe',
  percent: 0,
  dirsScanned: 0,
  dirsHit: 0,
  dirsSkipped: 0,
  dirsUnreachable: 0,
  images: 0,
  currentPath: '',
  detailsPending: 0,
  concurrency: DEFAULT_READ_CONCURRENCY,
  batchIndex: 0,
  batchTotal: 0,
  detailTotal: 0,
  detailDone: 0,
  etaMs: null,
})

interface BrokenDetail {
  /** 该层期望的目录名，如 EL、20261030、白班 */
  expected: string
  /** 父目录下实际存在的子目录，用于告诉用户「到底有什么」 */
  actual: string[]
}

/**
 * 一次扫描任务的执行体。
 *
 * 执行分三段，避免把「机台 × 日期 × 班次 × 时段 × 类型」的笛卡尔积全部平铺探测：
 * 1. 前缀探测：逐层 readdir（机台 → EL → 日期 → 班次），任一环缺失就把整个分支标记跳过
 * 2. 展开：用班次目录的 readdir 结果拿到真实时段、用时段目录的结果拿到真实类型，
 *    与用户勾选取交集 —— 一次列举替代 N 次存在性判断
 * 3. 收图：只对真实存在的类型目录读取文件
 */
export class ScanTaskRunner {
  readonly id: string
  readonly params: ScanTaskParams
  readonly createdAt = Date.now()

  private readonly context: TaskContext
  private readonly emit: (task: ScanTask) => void

  private status: ScanTaskStatus = 'pending'
  private pauseReason: 'user' | 'network' | null = null
  private error: string | null = null
  private startedAt: number | null = null
  private finishedAt: number | null = null

  private paused = false
  private resumeWaiters: (() => void)[] = []
  private readonly abortController = new AbortController()

  /** 执行体的终态信号，落盘历史前等它 */
  private readonly settled: Promise<boolean>
  private markSettled: (ok: boolean) => void = () => {}

  private branches: ScanBranch[] = []
  private images: ScannedImage[] = []
  private progress: ScanTaskProgress = emptyProgress()

  private totalLeaves = 0
  private doneLeaves = 0
  private probedMachines = 0
  private unreachableStreak = 0
  private lastEmitAt = 0

  /** 当前生效的并发档位与单次读取超时，会随失败率自动调整 */
  private readConcurrency: number
  private timeoutMs = MAX_TIMEOUT_MS
  /** 当前批次的限流器，降档时直接调用其 setConcurrency */
  private limiter: Limiter | null = null
  /** 每批并行处理的机台数，构造后固定 */
  private batchSize = DEFAULT_MACHINE_BATCH_SIZE
  /** 本窗口内的读取失败计数，用于自适应降档 */
  private windowReads = 0
  private windowFailures = 0
  /** 已探测完但文件明细还没读的目录，分批清尾用 */
  private readonly pendingDetails: { dir: string; machine: string }[] = []
  /** 逐目录明细阶段计入的总数与已完成数，用于收尾阶段进度 */
  private detailTotal = 0
  private detailDone = 0

  constructor(
    params: ScanTaskParams,
    context: TaskContext,
    emit: (task: ScanTask) => void,
  ) {
    this.id = crypto.randomUUID()
    this.params = params
    this.context = context
    this.emit = emit

    this.settled = new Promise<boolean>((resolve) => {
      this.markSettled = resolve
    })

    // 分支顺序与机台选择顺序一致，并发完成时也不会乱序
    this.branches = params.machines.map((machine) => ({
      machine,
      status: 'skipped',
      matchedDirs: 0,
      images: 0,
    }))

    this.totalLeaves =
      params.machines.length * params.slots.length * params.types.length

    // 现场机器为 8G 内存，并发按保守档起步，必要时再按失败率下调
    this.readConcurrency = clamp(
      context.load?.readConcurrency ?? DEFAULT_READ_CONCURRENCY,
      MIN_CONCURRENCY,
      MAX_CONCURRENCY,
    )
    this.batchSize = clamp(
      context.load?.machineBatchSize ?? DEFAULT_MACHINE_BATCH_SIZE,
      1,
      MAX_BATCH_SIZE,
    )
    this.timeoutMs = timeoutFor(this.readConcurrency)

    this.progress.concurrency = this.readConcurrency
    this.progress.batchTotal = Math.max(
      1,
      Math.ceil(params.machines.length / this.batchSize),
    )
    this.progress.batchIndex = params.machines.length > 0 ? 1 : 0
  }

  // ---------------------------------------------------------------- 对外操作

  start(): ScanTask {
    if (this.status !== 'pending') return this.snapshot()

    this.status = 'running'
    this.startedAt = Date.now()
    this.touch('', true)
    void this.run()

    return this.snapshot()
  }

  pause(reason: 'user' | 'network' = 'user'): ScanTask {
    if (this.status !== 'running') return this.snapshot()

    this.paused = true
    this.pauseReason = reason
    this.status = 'paused'
    this.touch('', true)

    return this.snapshot()
  }

  resume(): ScanTask {
    if (this.status !== 'paused') return this.snapshot()

    this.paused = false
    this.pauseReason = null
    this.unreachableStreak = 0
    this.status = 'running'

    const waiters = this.resumeWaiters.splice(0)
    for (const resolve of waiters) resolve()

    this.touch('', true)

    return this.snapshot()
  }

  cancel(): ScanTask {
    if (
      this.status === 'completed' ||
      this.status === 'canceled' ||
      this.status === 'failed'
    ) {
      return this.snapshot()
    }

    // 已取消的任务不再执行任何目录读取，checkpoint 会抛出 AbortError
    this.abortController.abort()
    this.paused = false

    const waiters = this.resumeWaiters.splice(0)
    for (const resolve of waiters) resolve()

    // 立即反馈状态，不等执行体在下一个检查点退出；已完成的结果原样保留
    this.status = 'canceled'
    this.touch('', true)

    return this.snapshot()
  }

  snapshot(): ScanTask {
    return {
      id: this.id,
      status: this.status,
      params: this.params,
      progress: { ...this.progress },
      branches: this.branches.map((branch) => ({ ...branch })),
      pauseReason: this.pauseReason,
      error: this.error,
      createdAt: this.createdAt,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      totalImages: this.images.length,
      preview: this.images.slice(0, PREVIEW_LIMIT),
      elapsedMs:
        (this.finishedAt ?? Date.now()) - (this.startedAt ?? this.createdAt),
    }
  }

  /** 全量结果，供复制步骤使用，不经过渲染层 */
  getImages(): ScannedImage[] {
    return this.images
  }

  getStatus(): ScanTaskStatus {
    return this.status
  }

  /**
   * 等待任务真正结束（含取消后的异步收尾）。
   *
   * cancel() 是立即返回 canceled 的，执行体还要几个检查点才退出；
   * 落盘历史必须等收尾完成，否则会把「取消瞬间」的中间结果写成最终结果。
   */
  waitSettled(): Promise<boolean> {
    return this.settled
  }

  // ---------------------------------------------------------------- 执行主体

  private async run(): Promise<void> {
    try {
      // 阶段 0：根目录预检。断网时一次就能定位，不必让几百个目录逐个等超时
      const root = await probePath(this.context.rootPath)

      if (!root.ok) {
        this.fail(
          root.status === 'unreachable'
            ? `网络路径不可达：${this.context.rootPath}，请确认共享盘已连接后重试`
            : root.status === 'denied'
              ? `没有访问「${this.context.rootPath}」的权限，请检查共享目录授权`
              : `根目录不存在：${this.context.rootPath}，请重新选择`,
        )
        return
      }

      const limiter = createLimiter(this.readConcurrency)
      this.limiter = limiter

      // 机台分批：一批跑完再开下一批。同时开所有机台会让几百个并发请求
      // 同时排队，8G 机器扛不住；分批后内存峰值只与单批机台数相关。
      const batches = chunk(this.params.machines, this.batchSize)

      for (let index = 0; index < batches.length; index += 1) {
        await this.checkpoint()

        this.progress.batchIndex = index + 1
        this.touch('', true)

        await Promise.all(
          batches[index].map((machine) => this.scanMachine(machine, limiter)),
        )
      }

      // 探测完成后逐目录补读文件明细，同样走闸门，不再另开并发
      await this.collectDetails(limiter)

      this.progress.phase = 'done'
      this.progress.currentPath = ''
      this.progress.detailsPending = 0
      this.progress.etaMs = 0
      this.status = 'completed'
    } catch (error) {
      if (isAbortError(error)) {
        // 取消属于正常流程：保留已收集的结果，状态标记 canceled
        this.status = 'canceled'
      } else {
        this.fail((error as Error)?.message ?? '扫描过程中发生未知错误')
      }
    } finally {
      this.finishedAt = Date.now()
      this.touch('', true)
      // 通知等待方：快照已定稿，可以落盘了
      this.markSettled(true)
    }
  }

  private fail(message: string): void {
    this.status = 'failed'
    this.error = message
  }

  /** 单个机台分支：机台 → EL → 日期 → 班次 → 时段 → 类型 */
  private async scanMachine(machine: string, limiter: Limiter): Promise<void> {
    const branch = this.branches.find((item) => item.machine === machine)
    if (!branch) return

    const machineDir = join(this.context.rootPath, machine)

    // 第 1 层：机台目录本身，顺带确认 EL 是否存在
    const machineRead = await this.read(machineDir)

    if (machineRead.status !== 'ok') {
      this.markBroken(branch, machineRead, 'EL', `${machine} 目录`)
      return
    }

    if (!machineRead.dirs.includes(this.context.entry)) {
      this.markBroken(
        branch,
        { status: 'missing', dirs: [], files: [], elapsedMs: 0 },
        'EL',
        machine,
        {
          expected: this.context.entry,
          actual: machineRead.dirs,
        },
      )
      return
    }

    // 第 2 层：EL → 日期
    const entryDir = join(machineDir, this.context.entry)
    const entryRead = await this.read(entryDir)

    if (entryRead.status !== 'ok') {
      this.markBroken(
        branch,
        entryRead,
        '日期',
        `${machine}/${this.context.entry}`,
      )
      return
    }

    if (!entryRead.dirs.includes(this.params.date)) {
      this.markBroken(
        branch,
        { status: 'missing', dirs: [], files: [], elapsedMs: 0 },
        '日期',
        `${machine}/${this.context.entry}`,
        { expected: this.params.date, actual: entryRead.dirs },
      )
      return
    }

    // 第 3 层：日期 → 班次
    const dateDir = join(entryDir, this.params.date)
    const dateRead = await this.read(dateDir)

    if (dateRead.status !== 'ok') {
      this.markBroken(
        branch,
        dateRead,
        '班次',
        `${machine}/${this.context.entry}/${this.params.date}`,
      )
      return
    }

    if (!dateRead.dirs.includes(this.params.shift)) {
      this.markBroken(
        branch,
        { status: 'missing', dirs: [], files: [], elapsedMs: 0 },
        '班次',
        `${machine}/${this.context.entry}/${this.params.date}`,
        { expected: this.params.shift, actual: dateRead.dirs },
      )
      return
    }

    // 第 4 层：班次 → 实际存在的时段
    const shiftDir = join(dateDir, this.params.shift)
    const shiftRead = await this.read(shiftDir)

    if (shiftRead.status !== 'ok') {
      this.markBroken(
        branch,
        shiftRead,
        '时段',
        `${machine}/${this.context.entry}/${this.params.date}/${this.params.shift}`,
      )
      return
    }

    branch.availableSlots = shiftRead.dirs
    this.probedMachines += 1

    const hitSlots = this.params.slots.filter((slot) =>
      shiftRead.dirs.includes(slot),
    )
    const missedSlots = this.params.slots.filter(
      (slot) => !shiftRead.dirs.includes(slot),
    )

    // 父级缺失的时段：其下所有类型目录一并记为跳过，不再发请求
    if (missedSlots.length) {
      const skipped = missedSlots.length * this.params.types.length
      this.doneLeaves += skipped
      this.progress.dirsSkipped += skipped
    }

    if (!hitSlots.length) {
      branch.status = 'missing'
      branch.brokenAt = '时段'
      branch.message = `该班次下没有所选时段，实际存在：${summarize(shiftRead.dirs)}`
      this.touch(shiftDir, true)

      return
    }

    const typeSeen = new Set<string>()

    // 第 5 层：时段 → 实际存在的类型目录。
    // 这里只 readdir 确认类型目录存在并把路径挂进待收队列，
    // 真正的文件明细在整棵树探测完之后统一补读（collectDetails）。
    //
    // 注意不要在已占用闸门名额的任务里再嵌套 limiter() 调用：
    // 并发为 1 时外层任务拿着唯一名额等内层，内层在等名额，直接死锁。
    // 所以先用 limiter 把所有时段的读取各占一个名额并发跑完，
    // 再在主流程里串行处理结果 —— 结果处理是纯内存操作，不需要并发。
    const slotReads = await Promise.all(
      hitSlots.map((slot) =>
        limiter(async () => {
          await this.checkpoint()
          return { slot, result: await this.read(join(shiftDir, slot)) }
        }),
      ),
    )

    for (const { slot, result: slotRead } of slotReads) {
      const slotDir = join(shiftDir, slot)

      if (slotRead.status !== 'ok') {
        // 时段目录在列举后被删、或恰好无权限：按跳过处理，不阻断整次任务
        const skipped = this.params.types.length
        this.doneLeaves += skipped
        this.progress.dirsSkipped += skipped
        continue
      }

      for (const type of slotRead.dirs) typeSeen.add(type)

      for (const type of this.params.types) {
        this.doneLeaves += 1

        if (!slotRead.dirs.includes(type)) {
          this.progress.dirsSkipped += 1
          continue
        }

        this.pendingDetails.push({ dir: join(slotDir, type), machine })
        this.detailTotal += 1
      }

      this.touch(slotDir)
    }

    this.progress.detailsPending = this.pendingDetails.length

    branch.availableTypes = [...typeSeen]

    // 最终状态在 collectDetails 里判定：只有真读到图片才算命中
    if (!typeSeen.size) {
      branch.status = 'empty'
      branch.brokenAt = '类型'
      branch.message = `所选时段存在，但没有匹配的类型目录，实际存在：（空目录）`
    }

    this.touch(shiftDir, true)
  }

  /**
   * 收尾阶段：逐目录读取文件明细并收集图片。
   *
   * 与探测分开的理由是内存而非速度 —— 探测只拿目录名，几百个机台的
   * 目录列表加起来也不过几 MB；而每读一个目录就把文件名、绝对路径全留在
   * 进程里，几万张图会占掉上百 MB。所以探测跑完整批，再统一按闸门收尾，
   * 闸门上限同时约束探测和收尾，总并发不会叠加。
   */
  private async collectDetails(limiter: Limiter): Promise<void> {
    if (!this.pendingDetails.length) return

    this.progress.detailTotal = this.detailTotal
    this.touch('', true)

    const queue = this.pendingDetails.splice(0)

    await Promise.all(
      queue.map((item) =>
        limiter(async () => {
          await this.checkpoint()

          const machine = item.machine
          const branch = this.branches.find(
            (entry) => entry.machine === machine,
          )
          const typeRead = await this.read(item.dir)

          this.detailDone += 1
          this.progress.detailDone = this.detailDone
          this.progress.detailsPending = queue.length - this.detailDone

          if (!branch) return

          if (typeRead.status !== 'ok') {
            this.progress.dirsSkipped += 1
            return
          }

          const images = typeRead.files.filter(isImageFile)

          if (!images.length) {
            branch.status = branch.status === 'hit' ? 'hit' : 'empty'
            return
          }

          branch.matchedDirs += 1
          branch.images += images.length
          branch.status = 'hit'
          this.progress.dirsHit += 1

          const segments = relativeSegments(this.context.rootPath, item.dir)

          for (const name of images) {
            this.images.push({
              path: [...segments, name].join('/'),
              absolutePath: join(item.dir, name),
              name,
            })
          }

          this.progress.images = this.images.length
          this.touch(item.dir)
        }),
      ),
    )

    for (const branch of this.branches) {
      // 断链（missing / unreachable）与已命中的分支不动：
      // 断链分支的诊断文案在 markBroken 里写好了，不能被兜底逻辑覆盖
      if (branch.status === 'hit' || branch.status === 'skipped') continue
      if (branch.status === 'missing' || branch.status === 'unreachable')
        continue

      branch.status = 'empty'
      branch.brokenAt = branch.brokenAt ?? '类型'
      branch.message =
        branch.message ??
        `所选时段存在，但没有读到图片，实际存在：${summarize(branch.availableTypes ?? [])}`
    }
  }

  /** 统一读取入口：超时、网络故障计数、自适应降档与自动暂停都在这里 */
  private async read(path: string): Promise<DirReadResult> {
    await this.checkpoint()

    const result = await readDirSafe(path, { timeoutMs: this.timeoutMs })

    if (result.status === 'ok') {
      this.progress.dirsScanned += 1
      this.unreachableStreak = 0
      this.recordSample(false)
    } else if (isNetworkError(result.status)) {
      this.progress.dirsUnreachable += 1
      this.unreachableStreak += 1
      this.recordSample(true)

      if (this.unreachableStreak >= NETWORK_FAILURE_LIMIT) {
        const root = await probePath(this.context.rootPath, {
          timeoutMs: this.timeoutMs,
        })

        // 根目录仍可达说明只是个别目录异常，重置计数继续；否则判定断连并暂停
        if (root.ok) {
          this.unreachableStreak = 0
        } else {
          this.pause('network')
        }
      }
    }

    this.touch(path)

    return result
  }

  /**
   * 采样一次读取结果，窗口内失败率过高就降一档并发。
   * 只降不升：现场是「跑完就行」的场景，反复升档试探只会让已经吃紧的机器更抖。
   */
  private recordSample(failed: boolean): void {
    this.windowReads += 1
    if (failed) this.windowFailures += 1

    if (this.windowReads < ADAPT_WINDOW) return

    const ratio = this.windowFailures / this.windowReads
    this.windowReads = 0
    this.windowFailures = 0

    if (ratio <= ADAPT_FAIL_RATIO || this.readConcurrency <= MIN_CONCURRENCY)
      return

    this.readConcurrency -= 1
    this.timeoutMs = timeoutFor(this.readConcurrency)
    this.progress.concurrency = this.readConcurrency
    this.limiter?.setConcurrency(this.readConcurrency)

    console.warn(
      `读取失败率 ${(ratio * 100).toFixed(0)}%，并发降至 ${this.readConcurrency}，超时 ${this.timeoutMs} 毫秒`,
    )

    this.touch('', true)
  }

  /** 标记分支断链，并把该分支下所有待扫描叶子计为跳过 */
  private markBroken(
    branch: ScanBranch,
    result: DirReadResult,
    brokenAt: NonNullable<ScanBranch['brokenAt']>,
    where: string,
    detail?: BrokenDetail,
  ): void {
    const skipped = this.params.slots.length * this.params.types.length
    this.doneLeaves += skipped
    this.progress.dirsSkipped += skipped

    branch.brokenAt = brokenAt
    branch.status = result.status === 'unreachable' ? 'unreachable' : 'missing'

    if (result.status === 'unreachable') {
      branch.message = `「${where}」不可达，请检查网络连接`
    } else if (result.status === 'denied') {
      branch.message = `没有读取「${where}」的权限`
    } else if (detail) {
      branch.message = `「${where}」下没有「${detail.expected}」，实际存在：${summarize(detail.actual)}`
    } else {
      branch.message = `「${where}」不可访问`
    }

    this.probedMachines += 1
    this.touch(where, true)
  }

  // ---------------------------------------------------------------- 进度与节流

  private computePercent(): number {
    if (this.progress.phase === 'done') return 100

    const machineTotal = this.params.machines.length || 1
    const leafTotal = this.totalLeaves || 1

    const probeRatio = Math.min(1, this.probedMachines / machineTotal)
    const leafRatio = Math.min(1, this.doneLeaves / leafTotal)
    const detailRatio =
      this.detailTotal > 0 ? Math.min(1, this.detailDone / this.detailTotal) : 0

    // 探测 20%、叶子确定 50%、逐目录读明细 30%，三者都完成才是 100%
    return Math.min(
      100,
      Math.round(
        probeRatio * PROBE_WEIGHT +
          leafRatio * (100 - PROBE_WEIGHT - DETAIL_WEIGHT) +
          detailRatio * DETAIL_WEIGHT,
      ),
    )
  }

  /** 按已完成比例估算剩余时间；样本太少时返回 null，避免一开始就跳变 */
  private estimateEta(percent: number): number | null {
    if (percent >= 100) return 0
    if (percent < 5 || !this.startedAt) return null

    const elapsed = Date.now() - this.startedAt
    const remaining = (elapsed / percent) * (100 - percent)

    return Number.isFinite(remaining) && remaining > 0
      ? Math.round(remaining)
      : null
  }

  private touch(currentPath: string, force = false): void {
    if (currentPath) this.progress.currentPath = currentPath

    if (this.progress.phase !== 'done') {
      this.progress.phase =
        this.probedMachines >= this.params.machines.length ? 'collect' : 'probe'
    }

    this.progress.percent = this.computePercent()
    this.progress.etaMs = this.estimateEta(this.progress.percent)

    const now = Date.now()
    if (!force && now - this.lastEmitAt < PROGRESS_INTERVAL_MS) return

    this.lastEmitAt = now
    this.emit(this.snapshot())
  }

  /** 暂停/取消检查点：每个目录读取之前都会经过这里 */
  private async checkpoint(): Promise<void> {
    if (this.abortController.signal.aborted) throw abortError()

    while (this.paused) {
      await new Promise<void>((resolve) => {
        this.resumeWaiters.push(resolve)
      })
    }

    if (this.abortController.signal.aborted) throw abortError()
  }
}
