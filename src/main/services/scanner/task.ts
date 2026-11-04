import { join } from 'node:path'

import type {
  ScanBranch,
  ScanCategory,
  ScanTask,
  ScanTaskParams,
  ScanTaskProgress,
  ScanTaskStatus,
  ScannedImage,
} from '../../../shared/ipc'

import { PL_LEVELS } from '../../../shared/ipc'
import { AUTH_HINT, NETWORK_HINT } from '../../../shared/networkHint'
import { timeoutForConcurrency, createAdaptiveGate } from '../../utils/adaptive'
import type { AdaptiveGate } from '../../utils/adaptive'
import { isNetworkError, readDirSafe } from './fsx'
import type { DirReadResult } from './fsx'
import { isImageFile } from './imageFiles'
import { createLimiter } from './limiter'
import type { Limiter } from './limiter'
import type { MachineResolver, PathShape } from './resolver'

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

/**
 * 最近一段时间里「不可达」占比超过该值，才判定整片断网并暂停。
 *
 * 以前是「连续 5 次」的绝对值。真机上的问题：森标 AOI 一次批量 2 台、
 * 每台 10 来个目录，里面只要连着碰上几台没认证的机器，5 次很快攒到，
 * 任务就"卡住"（其实是自动暂停了）。而车间断网是整片发生的，比例远比
 * 绝对值可靠 —— 90% 以上都读不通，才值得停下来让用户去接网络。
 */
const NETWORK_FAILURE_RATIO = 0.9
/** 参与判定的最近样本数；窗口太长会让接回网络后迟迟不解除统计 */
const NETWORK_FAILURE_WINDOW = 12
/**
 * 至少攒够这么多样本才下结论。
 *
 * 不能直接等窗口装满：整片断网时每台机台只贡献 1 个样本（解析就失败了），
 * 而判定跑在"第一批机台批处理结束"这个批次边界上 —— 一批 10 台就是 10 个
 * 样本，永远凑不满 12，断网反而不会被发现，任务继续逐台等超时。
 * 8 是折中：低于此数比例噪声太大，高于此数整片断网要等太久才停。
 */
const NETWORK_FAILURE_MIN = 8
/**
 * 连续多少台机台网络不可达，就直接判定断网。
 *
 * 车间的断网是整片发生的。AOI 一批 2 台，靠滑动窗口要跑 4 批才攒够样本，
 * 期间用户只看到进度条不动；按机台跨批累计是更早更准的信号。
 * 门槛设 3 是因为 2 台太小（两台恰好都关机很正常），不足以说明是断网；
 * 只有 network 不可达才计数，未认证/无权限/无共享不算。
 */
const BATCH_UNREACHABLE_MIN = 3

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

/** 并发档位上下限 */
const MIN_CONCURRENCY = 1
const MAX_CONCURRENCY = 12
const MAX_BATCH_SIZE = 12

/** 单次读取超时的可调范围，随并发档位一起收紧 */
const MIN_TIMEOUT_MS = 8_000
export const MAX_TIMEOUT_MS = 20_000

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.round(value)))

/** 并发 4 时给满 20 秒；降到 1 时只给 8 秒，网络真断了就该尽快失败 */
const timeoutFor = (concurrency: number): number =>
  timeoutForConcurrency(
    concurrency,
    DEFAULT_READ_CONCURRENCY,
    MIN_TIMEOUT_MS,
    MAX_TIMEOUT_MS,
  )

/** 期望值过长时截断，避免提示文案撑满面板 */
const summarize = (values: string[], max = 6): string =>
  values.length === 0
    ? '（空目录）'
    : values.length > max
      ? `${values.slice(0, max).join('、')} 等 ${values.length} 项`
      : values.join('、')

/**
 * 「类型目录在、但里面没有图片」的提示。
 *
 * 现场第一版写的是「已匹配 0 个目录，共 0 张」，两个数字都是 0，
 * 看不出到底是目录没找到还是目录空。这里的 checked 是「查过几个所选类型目录」，
 * 并附上实际探测到的类型，用户一眼就能判断该去翻哪里。
 */
const noImageMessage = (checked: number, available: string[]): string => {
  const actual = available.length ? `，实际存在：${summarize(available)}` : ''

  return checked
    ? `所选类型目录存在，但里面没有图片文件：已检查 ${checked} 个目录，一张图都没有${actual}`
    : `所选类型目录存在，但里面没有图片文件${actual}`
}

const abortError = (): Error => {
  const error = new Error('任务已取消')
  error.name = 'AbortError'
  return error
}

const isAbortError = (error: unknown): boolean =>
  error instanceof Error && error.name === 'AbortError'

export interface TaskContext {
  /** 扫描类别；参数里的 category 优先，这里作为兜底 */
  category: ScanCategory
  /**
   * 机台 → 路径前缀。EL 与力禧特的差别全在这里，
   * 拿到 base 之后日期、班次、时段、类型四层的处理完全一致。
   */
  resolver: MachineResolver
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
  machinesPending: 0,
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
  /**
   * 已经下结论的机台数（探测完成、解析失败、中途断链都算）。
   *
   * 用来给"还要补读多少明细"和"还剩几台没下结论"提供确定的数字。
   * 从进度数字倒推不行：断链时叶子记成"跳过"，从计数上看不出这台
   * 机台其实已经处理完了。
   */
  private finishedMachines = 0
  private probedMachines = 0
  /**
   * 最近若干次读取结果（true = 不可达），判断整片断网用。
   *
   * 用它替代原来的「连续不可达计数」：两种失败会让计数器清零，
   * 一是夹在中间的 missing / denied / unreadable，二是并发下别的泳道
   * 刚好读到一台通的机器。结果就是明明整片断网，暂停却迟迟不触发；
   * 反过来几台没认证的机器扎堆时，又会把好好的任务暂停掉 —— 现场看到的
   * 「扫着扫着卡住」和「点继续立刻出结果」都是这两头造成的。
   */
  private readonly reachabilityWindow: boolean[] = []
  /**
   * 当前批次里连得上 / 连不上的机台数，以及跨批累计的连续不可达台数。
   *
   * 滑动窗口按"读取次数"采样，而整片断网时机台在解析阶段就失败、
   * 每台只贡献 1 个样本；AOI 一批才 2 台，等窗口攒够 8 个样本要跑 4 批，
   * 期间每台都要等满超时。这里按机台跨批累计：一批全不通就累加，
   * 出现任意一台可达就清零，达到阈值立即暂停，不再等滑动窗口。
   */
  private batchReachable = 0
  private batchFailed = 0
  private unreachableMachineStreak = 0
  private lastEmitAt = 0

  /** 当前生效的并发档位与单次读取超时，会随失败率自动调整 */
  private readConcurrency: number
  private timeoutMs = MAX_TIMEOUT_MS
  /** 当前批次的限流器，降档时直接调用其 setConcurrency */
  private limiter: Limiter | null = null
  /** 每批并行处理的机台数，构造后固定 */
  private batchSize = DEFAULT_MACHINE_BATCH_SIZE
  /** 失败率采样器，与复制任务共用同一套降档逻辑 */
  private readonly gate: AdaptiveGate
  /** 已探测完但文件明细还没读的目录，分批清尾用 */
  private readonly pendingDetails: { dir: string; machine: string }[] = []
  /** 逐目录明细阶段计入的总数与已完成数，用于收尾阶段进度 */
  private detailTotal = 0
  private detailDone = 0

  /** 前缀之后的层级差异（日期格式、机台名层、Fail/等级层），由解析器声明 */
  private readonly shape: PathShape
  /** 等级层实际参与扫描的取值；没有等级层时是 ['']，让叶子数计算统一 */
  private readonly levels: string[]
  /** 路径里没有时段层（森标 AOI）：班次目录下直接是类型目录 */
  private readonly slotless: boolean
  /** 单个机台分支的叶子数：有效时段 × 等级 × 类型 */
  private readonly leavesPerBranch: number

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

    // 层级差异全部来自解析器：EL / 力禧特是标准三层，利珀多机台名层与等级层
    this.shape = context.resolver.shape ?? {}
    this.slotless = this.shape.hasSlots === false
    this.levels = this.shape.hasLevel
      ? params.levels?.length
        ? params.levels
        : [...PL_LEVELS]
      : ['']
    // 没有时段层时按 1 个有效时段算，否则叶子数为 0，进度与跳过计数都不动
    this.leavesPerBranch =
      (this.slotless ? 1 : params.slots.length) *
      this.levels.length *
      params.types.length

    // 分支顺序与机台选择顺序一致，并发完成时也不会乱序
    this.branches = params.machines.map((machine) => ({
      machine,
      status: 'skipped',
      matchedDirs: 0,
      images: 0,
    }))

    this.totalLeaves = params.machines.length * this.leavesPerBranch

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
    this.gate = createAdaptiveGate({
      initial: this.readConcurrency,
      min: MIN_CONCURRENCY,
      onChange: (concurrency, ratio) => {
        this.readConcurrency = concurrency
        this.timeoutMs = timeoutFor(concurrency)
        this.progress.concurrency = concurrency
        this.limiter?.setConcurrency(concurrency)

        console.warn(
          `读取失败率 ${(ratio * 100).toFixed(0)}%，并发降至 ${concurrency}，超时 ${this.timeoutMs} 毫秒`,
        )

        this.touch('', true)
      },
    })

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
    // 清空样本窗口：用户点「继续」就是在说「网络已经好了」，
    // 带着旧样本继续统计，接回网络后的头几次读取仍然会被算成失败
    this.reachabilityWindow.length = 0
    this.batchReachable = 0
    this.batchFailed = 0
    this.unreachableMachineStreak = 0
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
      // 阶段 0：配置预检。少配了根目录/入口就在开跑前说清楚，
      // 不必让每台机台都各自失败一次再汇总。
      const problem = this.context.resolver.validate()

      if (problem) {
        this.fail(problem)
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
        // 每批开始前清空批内计数；跨批的连续不可达由
        // unreachableMachineStreak 维护，达到阈值立即暂停
        this.batchReachable = 0
        this.batchFailed = 0
        this.touch('', true)

        await Promise.all(
          batches[index].map((machine) => this.scanMachine(machine, limiter)),
        )

        // 本批全部有结论后再看一次整批的通断情况。
        // 不能在单台失败时判：一批 8 台并发解析，前 3 台先失败的瞬间
        // "失败数 === 已完成数"成立，会被误判成整片断网。
        this.checkBatchUnreachable()

        // 整批都不通就停下来等用户接网络，不必继续跑下一批去等超时
        await this.checkpoint()
      }

      // 最后一批里触发的网络暂停也要生效：下面会把状态写成 completed，
      // 少了这个检查点，刚暂停的任务会被“完成”覆盖，界面看不到断网提示
      await this.checkpoint()

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
      // 补一次强制推送：finally 只做落盘通知，不推快照的话，最后一个
      // 进度事件可能被节流丢掉，界面停在 70% 而任务其实已经结束了 ——
      // 现场看到的「卡住，点继续立刻出结果」有一部分就是这么来的
      this.touch('', true)
      // 通知等待方：快照已定稿，可以落盘了
      this.markSettled(true)
    }
  }

  private fail(message: string): void {
    this.status = 'failed'
    this.error = message
  }

  /** 单个机台分支：机台 → 解析出的路径前缀 → 日期 → 班次 → 时段 → 类型 */
  private async scanMachine(machine: string, limiter: Limiter): Promise<void> {
    const branch = this.branches.find((item) => item.machine === machine)
    if (!branch) return

    // 第 1 步：把机台换成绝对路径前缀。
    // EL 会校验「根/机台/EL」存在；力禧特要先探出这台机器用的是
    // el 还是 SaveImages。解析本身含网络读取，所以也走闸门。
    const resolved = await limiter(() => this.context.resolver.resolve(machine))

    if (!resolved.ok) {
      this.markUnresolved(branch, resolved)
      return
    }

    const base = resolved.base
    // 前缀层是「这台机台能不能读」的第一道门。AOI 用更短的超时：
    // 未认证时 SMB 只给 UNKNOWN，没必要等满自适应超时；深层的日期/班次
    // 只有在这次读通之后才会被拼接。
    const baseRead = await this.read(base, this.shape.baseReadTimeoutMs)

    if (baseRead.status !== 'ok') {
      this.markBroken(
        branch,
        baseRead,
        resolved.brokenAt ?? this.shape.baseBrokenAt ?? 'EL',
        base,
      )
      return
    }

    // 第 2 层：前缀 → 日期。目录名由解析器决定（利珀是 2026.10.28）
    const dateName = this.shape.dateDir?.(this.params.date) ?? this.params.date

    if (!baseRead.dirs.includes(dateName)) {
      this.markBroken(
        branch,
        { status: 'missing', dirs: [], files: [], elapsedMs: 0 },
        '日期',
        base,
        { expected: dateName, actual: baseRead.dirs },
      )
      return
    }

    const dateDir = join(base, dateName)

    // 第 3 层：日期与班次之间可能还有固定层（利珀的「机台名」大写）。
    // 没有这一层时，班次目录直接挂在日期下面。
    const afterDate = this.shape.betweenDateAndShift?.(machine) ?? []
    const shiftBase = afterDate.length ? join(dateDir, ...afterDate) : dateDir

    let shiftBaseDirs: string[]

    if (afterDate.length) {
      const midRead = await this.read(shiftBase)

      if (midRead.status !== 'ok') {
        this.markBroken(branch, midRead, '机台名', `${base}/${dateName}`)
        return
      }

      shiftBaseDirs = midRead.dirs
    } else {
      const dateRead = await this.read(dateDir)

      if (dateRead.status !== 'ok') {
        this.markBroken(branch, dateRead, '班次', `${base}/${dateName}`)
        return
      }

      shiftBaseDirs = dateRead.dirs
    }

    // 第 4 层：班次。目录名由解析器决定（森标 AOI 是 8.5/20.5）
    const shiftName =
      this.shape.shiftDir?.(this.params.shift) ?? this.params.shift

    if (!shiftBaseDirs.includes(shiftName)) {
      this.markBroken(
        branch,
        { status: 'missing', dirs: [], files: [], elapsedMs: 0 },
        '班次',
        shiftBase,
        { expected: shiftName, actual: shiftBaseDirs },
      )
      return
    }

    const shiftDir = join(shiftBase, shiftName)
    const shiftRead = await this.read(shiftDir)

    if (shiftRead.status !== 'ok') {
      this.markBroken(
        branch,
        shiftRead,
        this.slotless ? '班次' : '时段',
        `${shiftBase}/${shiftName}`,
      )
      return
    }

    this.probedMachines += 1
    this.finishedMachines += 1
    // 这台机台一路读到了班次目录，网络是通的
    this.noteMachineReachability(true)
    if (this.slotless) {
      this.collectSlotlessTypes(branch, machine, shiftDir, shiftRead.dirs)
      return
    }

    branch.availableSlots = shiftRead.dirs

    const hitSlots = this.params.slots.filter((slot) =>
      shiftRead.dirs.includes(slot),
    )
    const missedSlots = this.params.slots.filter(
      (slot) => !shiftRead.dirs.includes(slot),
    )

    // 父级缺失的时段：其下所有等级 × 类型目录一并记为跳过，不再发请求
    if (missedSlots.length) {
      const skipped =
        missedSlots.length * this.levels.length * this.params.types.length
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
    //
    // 也不用 Promise.all(hitSlots.map(limiter))：那会把整个时段列表一次性
    // 全塞进 limiter 队列，取消后已排队的请求仍会被逐个放行，
    // 用户看到「已取消」但目录数还在涨。改成逐项申请、逐项处理，
    // 每次申请前先过 checkpoint，取消后就地停下。
    for (const slot of hitSlots) {
      const slotDir = join(shiftDir, slot)
      const slotRead = await limiter(async () => {
        await this.checkpoint()
        return this.read(slotDir)
      })

      if (slotRead.status !== 'ok') {
        // 时段目录在列举后被删、或恰好无权限：按跳过处理，不阻断整次任务
        this.doneLeaves += this.levels.length * this.params.types.length
        this.progress.dirsSkipped +=
          this.levels.length * this.params.types.length
        continue
      }

      // 第 6 层：时段与类型之间的固定层（利珀的 Fail），没有就是时段本身
      const beforeType = this.shape.betweenSlotAndType ?? []
      const typeRoot = beforeType.length
        ? join(slotDir, ...beforeType)
        : slotDir
      let typeRootDirs = slotRead.dirs

      if (beforeType.length) {
        const failRead = await limiter(async () => {
          await this.checkpoint()
          return this.read(typeRoot)
        })

        if (failRead.status !== 'ok') {
          this.doneLeaves += this.levels.length * this.params.types.length
          this.progress.dirsSkipped +=
            this.levels.length * this.params.types.length
          continue
        }

        typeRootDirs = failRead.dirs
      }

      // 第 7 层：等级（利珀的 A/B/C）。没有等级层时只有一个空占位，
      // 保证下面的循环对各类扫描是同一条代码。
      const levelDirs: { dir: string; dirs: string[] }[] = []

      if (this.shape.hasLevel) {
        for (const level of this.levels) {
          if (!typeRootDirs.includes(level)) {
            this.doneLeaves += this.params.types.length
            this.progress.dirsSkipped += this.params.types.length
            continue
          }

          const levelDir = join(typeRoot, level)
          const levelRead = await limiter(async () => {
            await this.checkpoint()
            return this.read(levelDir)
          })

          if (levelRead.status !== 'ok') {
            this.doneLeaves += this.params.types.length
            this.progress.dirsSkipped += this.params.types.length
            continue
          }

          levelDirs.push({ dir: levelDir, dirs: levelRead.dirs })
        }
      } else {
        levelDirs.push({ dir: slotDir, dirs: typeRootDirs })
      }

      for (const level of levelDirs) {
        for (const type of level.dirs) typeSeen.add(type)

        for (const type of this.params.types) {
          this.doneLeaves += 1

          if (!level.dirs.includes(type)) {
            this.progress.dirsSkipped += 1
            continue
          }

          this.pendingDetails.push({ dir: join(level.dir, type), machine })
          this.detailTotal += 1
        }
      }

      this.touch(slotDir)
    }

    this.progress.detailsPending = this.pendingDetails.length

    branch.availableTypes = [...typeSeen]

    // 最终状态在 collectDetails 里判定：只有真读到图片才算命中。
    // 但“所选类型一个都不存在”要在这里定性 —— 这类分支不会进待读队列，
    // 留给兜底会被写成“类型目录存在，但里面没有图片文件”，与实际相反。
    const matchedTypes = this.params.types.filter((type) => typeSeen.has(type))

    if (!matchedTypes.length) {
      branch.status = 'empty'
      branch.brokenAt = '类型'
      branch.message = typeSeen.size
        ? `所选时段下没有所选类型，实际存在：${summarize([...typeSeen])}`
        : '所选时段下没有类型目录'
    } else {
      // 类型目录确实找到了，只是还没读文件明细；先占位，
      // 由 collectDetails 决定是“目录在但没图”还是命中。
      branch.brokenAt = '未命中'
    }

    this.touch(shiftDir, true)
  }

  /**
   * 无时段层的收尾：班次目录下的子目录就是类型目录。
   *
   * 每个所选类型算一个叶子；命中的类型挂进待收队列，
   * 目录不存在的直接计入跳过，不发无效请求。
   */
  private collectSlotlessTypes(
    branch: ScanBranch,
    machine: string,
    shiftDir: string,
    typeDirs: string[],
  ): void {
    const seen = new Set(typeDirs)
    branch.availableTypes = [...seen]

    let matched = 0

    for (const type of this.params.types) {
      this.doneLeaves += 1

      if (!seen.has(type)) {
        this.progress.dirsSkipped += 1
        continue
      }

      matched += 1
      this.pendingDetails.push({ dir: join(shiftDir, type), machine })
      this.detailTotal += 1
    }

    this.progress.detailsPending = this.pendingDetails.length

    if (!matched) {
      branch.status = 'empty'
      branch.brokenAt = '类型'
      branch.message = seen.size
        ? `该班次下没有所选类型，实际存在：${summarize(typeDirs)}`
        : '该班次下没有类型目录'
    } else {
      // 类型目录确实找到了，只是还没读文件明细。
      // 这里必须把 brokenAt 标成「未命中」，否则下面 collectDetails 的兜底
      // 会把这一格留在「类型」上，界面显示成"没有所选类型"——
      // 现场看到的"明明有色斑B- 却说没有这个类型"就是这么来的。
      branch.brokenAt = '未命中'
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
    // 没有待读目录也要走一遍兜底：探测阶段"类型目录为空"的分支已经
    // 自己写过文案了，但"类型目录在、只是还没读"的分支要在这里才定性。
    // 以前这里直接 return，全靠 run() 里的 phase 切换兜住，容易被后续
    // 改动带偏成"明细读完了但状态还挂着探测阶段"。

    const queue = this.pendingDetails.splice(0)

    // 切阶段要在开始读第一个明细之前：界面上"探测目录 / 收集图片"
    // 与实际动作对不上，用户会以为卡在探测
    this.progress.phase = queue.length ? 'collect' : 'probe'
    this.progress.detailTotal = this.detailTotal
    this.touch('', true)

    // 不用 Promise.all(queue.map(...))：那样会把整个队列一次性派发下去，
    // 取消后已排队的读取仍会全部跑完，用户看到的「取消」要等几十秒才生效。
    // 改成 N 条泳道各自领活，每条泳道在领活前过 checkpoint，
    // 取消时立刻停下，只有正在读的那几个目录会自然收尾。
    let next = 0
    const lanes = Math.max(1, Math.min(this.readConcurrency, queue.length))

    const worker = async (): Promise<void> => {
      while (next < queue.length) {
        await this.checkpoint()

        if (this.abortController.signal.aborted) return

        const index = next
        next += 1

        await limiter(() => this.readDetail(queue[index]))
      }
    }

    await Promise.all(Array.from({ length: lanes }, worker))

    for (const branch of this.branches) {
      // 断链（missing / unreachable）与已命中的分支不动：
      // 断链分支的诊断文案在 markBroken 里写好了，不能被兜底逻辑覆盖
      if (branch.status === 'hit' || branch.status === 'skipped') continue
      if (branch.status === 'missing' || branch.status === 'unreachable')
        continue

      // 探测阶段已经定性的「没有所选类型 / 该班次下没有类型」不要动：
      // 这类分支压根没排进待读队列，一张图都没有是必然的，
      // 硬改成「未命中」会把正确的诊断文案覆盖成"目录在、只是没图"，
      // 用户照着去查那个类型目录，结果那里根本不存在。
      if (branch.brokenAt === '类型') continue

      // 走到这里说明类型目录找到了、但逐目录读下来一张图都没有。
      // 必须改写而不是沿用旧状态：探测阶段留下的「未命中」只是占位，
      // 在这一步才能确定是"目录在、没图"。
      branch.status = 'empty'
      branch.brokenAt = '未命中'
    }

    // 兜底文案统一在最后写，而不是塞在上面的循环里：
    // 「到底检查了几个所选目录」只跟探测结果有关，单独一段算不容易漏，
    // 也不会被后面新加的状态分支搅乱。
    //
    // 数字要写人话：第一版写成「已匹配 0 个目录，共 0 张」，现场反馈
    // 看了不知道是"目录没找到"还是"目录空"；这里改用「已检查 N 个目录」
    // 并附上实际存在的类型，一眼能看出目录是在的、只是没图。
    for (const branch of this.branches) {
      if (branch.status !== 'empty') continue
      // 「类型目录不存在」「该班次下没有类型」这两类结论在探测阶段就定了，
      // 与"目录在但没图"不是一回事，保持原样
      if (branch.brokenAt !== '未命中') continue

      branch.message = noImageMessage(
        this.params.types.filter((type) =>
          branch.availableTypes?.includes(type),
        ).length,
        branch.availableTypes ?? [],
      )
    }
  }

  /** 读一个类型目录的文件明细，并把图片挂到结果集上 */
  private async readDetail(item: {
    dir: string
    machine: string
  }): Promise<void> {
    // this.read() 里还会检查一次，但那是在拿到并发名额之后；
    // 这里先挡一道，取消后连名额都不必去抢
    if (this.abortController.signal.aborted) throw abortError()

    const branch = this.branches.find((entry) => entry.machine === item.machine)
    const typeRead = await this.read(item.dir)

    this.detailDone += 1
    this.progress.detailDone = this.detailDone
    this.progress.detailsPending = Math.max(
      0,
      this.detailTotal - this.detailDone,
    )

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

    const segments = this.context.resolver.segments(item.machine, item.dir)

    for (const name of images) {
      this.images.push({
        path: [...segments, name].join('/'),
        absolutePath: join(item.dir, name),
        name,
        // 复制按机台筛选/分组时用这个字段，路径第 0 段对力禧特、利珀、森标 AOI 是厂区
        machine: item.machine,
      })
    }

    this.progress.images = this.images.length
    this.touch(item.dir)
  }

  /**
   * 统一读取入口：超时、网络故障计数、自适应降档与自动暂停都在这里。
   *
   * timeoutMs 用于前缀层这类“先确认能不能进去”的浅层读取：AOI 未认证时
   * SMB 会返回 UNKNOWN，等满默认的 20 秒只会让整批机台看起来卡住。
   */
  private async read(
    path: string,
    timeoutMs = this.timeoutMs,
  ): Promise<DirReadResult> {
    await this.checkpoint()

    const result = await readDirSafe(path, { timeoutMs })

    if (result.status === 'ok') {
      this.progress.dirsScanned += 1
      this.noteReachability(false)
      this.recordSample(false)
    } else if (isNetworkError(result.status)) {
      this.progress.dirsUnreachable += 1
      this.noteReachability(true)
      this.recordSample(true)
    } else {
      // missing / denied 是路径或权限问题，不是网络不可达；
      // 不清零会让「网络×4 → 缺失目录 → 网络」被误判成连续断网
      this.noteReachability(false)
    }

    this.touch(path)

    return result
  }

  /**
   * 按最近一段读取结果判断是否整片断网，是就暂停等用户接回网络。
   *
   * 目录读取和解析器探测共用同一个窗口：力禧特/利珀在解析阶段就可能
   * 遇到整片断网，只统计 read() 的话任务会逐台等完超时才停。
   *
   * 注意只有「网络不可达」才算失败。未认证、无权限、目录不存在都只是
   * 这一台的问题，混进来会把正常任务判成断网（真机 46 台里 31 台未认证，
   * 按老逻辑早就该暂停了）。
   */
  private noteReachability(unreachable: boolean): void {
    this.reachabilityWindow.push(unreachable)

    if (this.reachabilityWindow.length > NETWORK_FAILURE_WINDOW) {
      this.reachabilityWindow.shift()
    }

    // 样本太少时不下结论：整片断网时前几台就会连续失败，
    // 一凑够几个就判定会被"5 台不通、3 台正常"这种局部故障骗到
    // （窗口里只有 5 个失败样本，比例 100%，实际整体才 62%）。
    if (this.reachabilityWindow.length < NETWORK_FAILURE_MIN) return

    const failed = this.reachabilityWindow.filter(Boolean).length
    const ratio = failed / this.reachabilityWindow.length

    if (ratio < NETWORK_FAILURE_RATIO) return

    if (this.status === 'running') this.pause('network')
  }

  /**
   * 按机台记账：这台机台最终是不是连不上。
   *
   * 与 noteReachability 分开是因为两者粒度不同 —— 前者按读取次数采样，
   * 适合判"整片断网"；这里按机台计数，供 checkBatchUnreachable 在批间累计。
   * 只有 network 不可达才计入失败；未认证/无权限/无共享不算断网。
   */
  private noteMachineReachability(reachable: boolean): void {
    if (reachable) this.batchReachable += 1
    else this.batchFailed += 1
  }

  /**
   * 一批跑完后看一次：连续多台机台都网络不可达，就暂停等用户接网络。
   *
   * 不能要求"单批 >= 3 台"：默认批次只有 2 台，那个条件永远不会成立。
   * 改为跨批累计——一批里只要有一台可达就清零，全都不通则把本批失败数
   * 累加；达到 BATCH_UNREACHABLE_MIN（3 台）立即暂停。这样
   * "一批 8 台里 5 台关机、3 台正常"仍不会误判。
   */
  private checkBatchUnreachable(): void {
    if (this.batchReachable > 0) {
      this.unreachableMachineStreak = 0
    } else if (this.batchFailed > 0) {
      this.unreachableMachineStreak += this.batchFailed
    }

    this.batchReachable = 0
    this.batchFailed = 0

    if (
      this.unreachableMachineStreak >= BATCH_UNREACHABLE_MIN &&
      this.status === 'running'
    ) {
      this.pause('network')
    }
  }

  /** 采样一次读取结果；降档的具体动作由 gate 的 onChange 回调完成 */
  private recordSample(failed: boolean): void {
    this.gate.sample(failed)
  }

  /** 标记分支断链，并把该分支下所有待扫描叶子计为跳过 */
  private markBroken(
    branch: ScanBranch,
    result: DirReadResult,
    brokenAt: NonNullable<ScanBranch['brokenAt']>,
    where: string,
    detail?: BrokenDetail,
  ): void {
    const skipped = this.leavesPerBranch
    this.doneLeaves += skipped
    this.progress.dirsSkipped += skipped
    this.finishedMachines += 1

    // 能走到这里说明路径已经解析出来了，至少共享根是通的。
    // 除非这一读本身就是网络超时，否则不算这台机台"连不上"。
    this.noteMachineReachability(result.status !== 'unreachable')

    branch.brokenAt = brokenAt

    // 原始报错单独存：现场要的是「哪台机器什么错」，而文案要的是人话。
    // 以前把 result.error 首行直接拼进 message，界面上就是
    // 「UNKNOWN: unknown error, scandir '\\10.108.8.203\SaveImages\'」——
    // 用户看完不知道这是没认证还是没这个目录。
    const raw = result.code ?? result.error?.split('\n')[0]?.trim()
    if (raw) branch.detail = raw

    if (result.status === 'unreachable') {
      branch.status = 'unreachable'
      branch.unreachableReason = 'network'
      branch.message = `「${where}」不可达（${raw ?? '网络超时'}），${NETWORK_HINT}`
    } else if (result.status === 'denied') {
      branch.status = 'unreachable'
      branch.unreachableReason = 'denied'
      branch.message = `没有读取「${where}」的权限，请联系 IT 开通该共享的读权限`
    } else if (result.status === 'unreadable') {
      // 未认证在 Windows 上就是这个样子：码是 UNKNOWN，没有更细的信息。
      // 与其猜成「目录不存在」，不如直接说清楚要做什么。
      branch.status = 'unreachable'
      branch.unreachableReason = 'auth'
      branch.message = `「${where}」读取失败，多半是未认证：${AUTH_HINT}，然后重新扫描`
    } else if (detail) {
      branch.status = 'missing'
      branch.missingName = detail.expected
      branch.message = `「${where}」下没有「${detail.expected}」，实际存在：${summarize(detail.actual)}`
    } else {
      branch.status = 'missing'
      // 结构化记住缺失的目录名，界面据此显示「20261103 目录不存在」这类短文案
      if (brokenAt === 'EL') branch.missingName = 'EL'
      else if (brokenAt === '共享名' && this.shape.baseName) {
        branch.missingName = this.shape.baseName
      }
      branch.message = `「${where}」不存在`
    }

    this.probedMachines += 1
    this.touch(where, true)
  }

  /**
   * 机台根本换不出路径前缀：入口里没有它、主机不通、共享名也探不到。
   *
   * 这类失败跟「某个目录读不到」不同，优先给出按原因分类的提示，
   * 现场才能一眼分清是没接专用内网、IP 变了，还是没权限。
   */
  private markUnresolved(
    branch: ScanBranch,
    resolved: {
      reason: string
      brokenAt?: ScanBranch['brokenAt']
      unreachable?: ScanBranch['unreachableReason']
    },
  ): void {
    const skipped = this.leavesPerBranch
    this.doneLeaves += skipped
    this.progress.dirsSkipped += skipped

    branch.brokenAt = resolved.brokenAt ?? '共享名'
    branch.status = resolved.unreachable ? 'unreachable' : 'missing'
    branch.unreachableReason = resolved.unreachable
    branch.message = resolved.reason

    // 解析阶段的不可达也要计入熔断；否则整片断网时会逐台等超时
    if (resolved.unreachable === 'network') {
      this.progress.dirsUnreachable += 1
    }
    this.noteReachability(resolved.unreachable === 'network')
    // 只有网络不通才算「这台机台连不上」。未认证/无权限/无共享只是这台
    // 机台自身的问题，把它们算成失败会让新阈值在 39 台未认证时误判断网。
    this.noteMachineReachability(resolved.unreachable !== 'network')

    this.probedMachines += 1
    this.finishedMachines += 1
    this.touch(branch.machine, true)
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

    // 派生值放在这里算最省心：不必在每条执行路径上都记得更新一次。
    // 界面靠它说明"还在等几台机台"，而不是只给一个百分比。
    this.progress.machinesPending = Math.max(
      0,
      this.params.machines.length - this.finishedMachines,
    )

    if (this.progress.phase !== 'done') {
      // 判定用「已下结论」而不是「探测成功」：断链的机台永远到不了
      // probedMachines，按后者算会一直挂着"探测目录"，
      // 实际却已经在读明细了 —— 界面上就是"卡在探测"
      this.progress.phase =
        this.finishedMachines >= this.params.machines.length
          ? 'collect'
          : 'probe'
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
