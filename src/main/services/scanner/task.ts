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
import { PREVIEW_LIMIT } from '../../../shared/historyLimit'
import { timeoutForConcurrency, createAdaptiveGate } from '../../utils/adaptive'
import type { AdaptiveGate } from '../../utils/adaptive'
import { createTaskLifecycle } from '../../utils/taskLifecycle'
import type { TaskLifecycle } from '../../utils/taskLifecycle'
import { isNetworkError, readDirSafe } from './fsx'
import type { DirReadResult } from './fsx'
import { describeLeafFailure, summarize } from './diagnosis'
import { isImageFile } from '../../../shared/imageExtensions'
import { createLimiter } from './limiter'
import type { Limiter } from './limiter'
import { createScanLedger } from './ledger'
import type { ScanLedger } from './ledger'
import { createBreaker } from './breaker'
import type { Breaker } from './breaker'
import type { MachineResolver, PathShape } from './resolver'
import { logger } from '../log'

/**
 * 并发上限的默认值，按现场机器（8G 内存 + 256G 盘）定的保守档：
 * 每个并发读取在 Windows 上约占一个句柄 + 一条 SMB 请求，
 * 4 个在 8G 机器上既能压住网络等待，又不会把内存和句柄打满。
 */
export const DEFAULT_READ_CONCURRENCY = 4

/** 每批处理的机台数：一批跑完再开下一批，避免所有机台的状态同时压在内存里 */
export const DEFAULT_MACHINE_BATCH_SIZE = 2

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

  /** 状态、暂停、中断信号、终态与推送节流统一由 lifecycle 维护 */
  private readonly lifecycle: TaskLifecycle
  private error: string | null = null

  private branches: ScanBranch[] = []
  private images: ScannedImage[] = []
  private progress: ScanTaskProgress = emptyProgress()

  /** leaf / 机台 / 明细计数器与 percent、phase、ETA 的唯一 owner */
  private readonly ledger: ScanLedger
  /**
   * 最近若干次读取结果（true = 不可达），判断整片断网用。
   *
   * 用它替代原来的「连续不可达计数」：两种失败会让计数器清零，
   * 一是夹在中间的 missing / denied / unreadable，二是并发下别的泳道
   * 刚好读到一台通的机器。结果就是明明整片断网，暂停却迟迟不触发；
   * 反过来几台没认证的机器扎堆时，又会把好好的任务暂停掉 —— 现场看到的
   * 「扫着扫着卡住」和「点继续立刻出结果」都是这两头造成的。
   */
  /** 断网熔断：滑动窗口 + 按机台跨批累计，策略在 breaker.ts */
  private readonly breaker: Breaker

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

    this.lifecycle = createTaskLifecycle({
      emit: () => this.emit(this.snapshot()),
      cancelMessage: '任务已取消',
    })

    // 断网策略与扫描流程解耦：执行器只喂样本，阈值与两条规则留在 breaker
    this.breaker = createBreaker({
      taskId: this.id,
      isRunning: () => this.lifecycle.status === 'running',
      onPause: () => this.pause('network'),
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

    this.ledger = createScanLedger({
      machines: params.machines.length,
      leavesPerBranch: this.leavesPerBranch,
    })

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
        logger.warn('scan', 'scan.concurrency.downgrade', {
          taskId: this.id,
          ratio,
          concurrency,
          timeoutMs: this.timeoutMs,
        })

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
    // 扫描只启动一次；复制允许 retry，所以 begin() 本身不限制终态
    if (this.lifecycle.status !== 'pending') return this.snapshot()
    if (!this.lifecycle.begin()) return this.snapshot()

    logger.info('scan', 'scan.start', {
      taskId: this.id,
      category: this.params.category,
      machines: this.params.machines.length,
      date: this.params.date,
      shift: this.params.shift,
      slots: this.params.slots.length,
      types: this.params.types.length,
      readConcurrency: this.readConcurrency,
      machineBatchSize: this.batchSize,
      timeoutMs: this.timeoutMs,
      batchTotal: this.progress.batchTotal,
    })

    this.touch('', true)
    void this.run()

    return this.snapshot()
  }

  pause(reason: 'user' | 'network' = 'user'): ScanTask {
    if (!this.lifecycle.pause(reason)) return this.snapshot()

    logger.info('scan', 'scan.pause', {
      taskId: this.id,
      reason,
      percent: this.progress.percent,
      machinesPending: this.progress.machinesPending,
      currentPath: this.progress.currentPath,
    })

    this.touch('', true)

    return this.snapshot()
  }

  resume(): ScanTask {
    if (!this.lifecycle.resume()) return this.snapshot()

    // 清空样本窗口：用户点「继续」就是在说「网络已经好了」，
    // 带着旧样本继续统计，接回网络后的头几次读取仍然会被算成失败
    this.breaker.reset()

    logger.info('scan', 'scan.resume', {
      taskId: this.id,
      percent: this.progress.percent,
    })

    this.touch('', true)

    return this.snapshot()
  }

  cancel(): ScanTask {
    if (!this.lifecycle.cancel()) return this.snapshot()

    logger.info('scan', 'scan.cancel', {
      taskId: this.id,
      percent: this.progress.percent,
      images: this.progress.images,
    })

    this.touch('', true)

    return this.snapshot()
  }

  snapshot(): ScanTask {
    const { status, pauseReason, startedAt, finishedAt } = this.lifecycle

    return {
      id: this.id,
      status,
      params: this.params,
      progress: { ...this.progress },
      branches: this.branches.map((branch) => ({ ...branch })),
      pauseReason,
      error: this.error,
      createdAt: this.createdAt,
      startedAt,
      finishedAt,
      totalImages: this.images.length,
      preview: this.images.slice(0, PREVIEW_LIMIT),
      elapsedMs: (finishedAt ?? Date.now()) - (startedAt ?? this.createdAt),
    }
  }

  /** 全量结果，供复制步骤使用，不经过渲染层 */
  getImages(): ScannedImage[] {
    return this.images
  }

  getStatus(): ScanTaskStatus {
    return this.lifecycle.status
  }

  /**
   * 等待任务真正结束（含取消后的异步收尾）。
   *
   * cancel() 是立即返回 canceled 的，执行体还要几个检查点才退出；
   * 落盘历史必须等收尾完成，否则会把「取消瞬间」的中间结果写成最终结果。
   */
  waitSettled(): Promise<boolean> {
    return this.lifecycle.waitSettled()
  }

  // ---------------------------------------------------------------- 执行主体

  private async run(): Promise<void> {
    let finalStatus: 'completed' | 'canceled' | 'failed' = 'completed'

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
        // 每批开始前清空批内计数；跨批的连续不可达由 breaker 维护
        this.breaker.beginBatch()
        this.touch('', true)

        logger.debug('scan', 'scan.batch.start', {
          taskId: this.id,
          batchIndex: index + 1,
          batchTotal: batches.length,
          machines: batches[index].length,
        })

        await Promise.all(
          batches[index].map((machine) => this.scanMachine(machine, limiter)),
        )

        // 本批全部有结论后再看一次整批的通断情况。
        // 不能在单台失败时判：一批 8 台并发解析，前 3 台先失败的瞬间
        // "失败数 === 已完成数"成立，会被误判成整片断网。
        this.breaker.endBatch()
        const reachability = this.breaker.stats()

        logger.debug('scan', 'scan.batch.end', {
          taskId: this.id,
          batchIndex: index + 1,
          batchReachable: reachability.batchReachable,
          batchFailed: reachability.batchFailed,
          unreachableMachineStreak: reachability.unreachableMachineStreak,
          dirsScanned: this.progress.dirsScanned,
          dirsHit: this.progress.dirsHit,
          dirsSkipped: this.progress.dirsSkipped,
          dirsUnreachable: this.progress.dirsUnreachable,
          images: this.progress.images,
        })

        // 整批都不通就停下来等用户接网络，不必继续跑下一批去等超时
        await this.checkpoint()
      }

      // 最后一批里触发的网络暂停也要生效：下面会把状态写成 completed，
      // 少了这个检查点，刚暂停的任务会被“完成”覆盖，界面看不到断网提示
      await this.checkpoint()

      // 探测完成后逐目录补读文件明细，同样走闸门，不再另开并发
      await this.collectDetails(limiter)

      this.progress.currentPath = ''
      this.ledger.finish()
    } catch (error) {
      if (isAbortError(error)) {
        // 取消属于正常流程：保留已收集的结果，状态标记 canceled
        finalStatus = 'canceled'
      } else {
        finalStatus = 'failed'
        this.fail((error as Error)?.message ?? '扫描过程中发生未知错误', error)
      }
    } finally {
      // 已经被 cancel() 定稿时不会覆盖；否则写入本轮终态并记下结束时间
      this.lifecycle.finish(finalStatus)

      const { status, startedAt } = this.lifecycle
      const finishedAt = this.lifecycle.finishedAt ?? Date.now()

      const branches = this.branches.reduce<Record<string, number>>(
        (counts, branch) => {
          counts[branch.status] = (counts[branch.status] ?? 0) + 1
          return counts
        },
        {},
      )

      logger.info('scan', 'scan.end', {
        taskId: this.id,
        status,
        elapsedMs: finishedAt - (startedAt ?? finishedAt),
        images: this.progress.images,
        dirsScanned: this.progress.dirsScanned,
        dirsHit: this.progress.dirsHit,
        dirsSkipped: this.progress.dirsSkipped,
        dirsUnreachable: this.progress.dirsUnreachable,
        batchTotal: this.progress.batchTotal,
        branches,
      })

      // 补一次强制推送：finally 只做落盘通知，不推快照的话，最后一个
      // 进度事件可能被节流丢掉，界面停在 70% 而任务其实已经结束了 ——
      // 现场看到的「卡住，点继续立刻出结果」有一部分就是这么来的
      this.touch('', true)
      // 通知等待方：快照已定稿，可以落盘了
      this.lifecycle.settle()
    }
  }

  private fail(message: string, error?: unknown): void {
    this.lifecycle.finish('failed')
    this.error = message

    logger.error('scan', 'scan.fail', {
      taskId: this.id,
      error: error ?? message,
      percent: this.progress.percent,
    })
  }

  /** 单个机台分支：机台 → 解析出的路径前缀 → 日期 → 班次 → 时段 → 类型 */
  private async scanMachine(machine: string, limiter: Limiter): Promise<void> {
    const branch = this.branches.find((item) => item.machine === machine)
    if (!branch) return

    // 第 1 步：把机台换成绝对路径前缀。
    // EL 会校验「根/机台/EL」存在；力禧特要先探出这台机器用的是
    // el 还是 SaveImages。解析本身含网络读取，所以也走闸门。
    const resolved = await limiter(() => this.context.resolver.resolve(machine))

    logger.debug('scan', 'scan.machine.resolved', () => ({
      taskId: this.id,
      machine,
      ok: resolved.ok,
      base: resolved.base,
      reason: resolved.reason,
      brokenAt: resolved.brokenAt,
      unreachable: resolved.unreachable,
    }))

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

    this.ledger.machineProbed()
    this.ledger.machineConcluded()
    // 这台机台一路读到了班次目录，网络是通的
    this.breaker.sampleMachine(true)
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
      this.ledger.leavesConcluded(0, skipped)
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
        this.ledger.leavesConcluded(
          0,
          this.levels.length * this.params.types.length,
        )
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
          this.ledger.leavesConcluded(
            0,
            this.levels.length * this.params.types.length,
          )
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
            this.ledger.leavesConcluded(0, this.params.types.length)
            continue
          }

          const levelDir = join(typeRoot, level)
          const levelRead = await limiter(async () => {
            await this.checkpoint()
            return this.read(levelDir)
          })

          if (levelRead.status !== 'ok') {
            this.ledger.leavesConcluded(0, this.params.types.length)
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
          if (!level.dirs.includes(type)) {
            this.ledger.leavesConcluded(0, 1)
            continue
          }

          this.ledger.leavesConcluded(1, 0)
          this.pendingDetails.push({ dir: join(level.dir, type), machine })
          this.ledger.detailQueued(1)
        }
      }

      this.touch(slotDir)
    }

    branch.availableTypes = [...typeSeen]

    // 最终状态在 collectDetails 里判定：只有真读到图片才算命中。
    // 但“所选类型一个都不存在”要在这里定性 —— 这类分支不会进待读队列，
    // 留给兜底会被写成“类型目录存在，但里面没有图片文件”，与实际相反。
    const matchedTypes = this.params.types.filter((type) => typeSeen.has(type))

    if (!matchedTypes.length) {
      branch.status = 'empty'
      branch.emptyReason = 'types-missing'
      branch.brokenAt = '类型'
      branch.message = typeSeen.size
        ? `所选时段下没有所选类型，实际存在：${summarize([...typeSeen])}`
        : '所选时段下没有类型目录'
    }
    // 类型目录找到了、只是还没读文件明细：不写占位状态，
    // 等 collectDetails 根据是否读到图片定性为 hit / no-images。

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
      if (!seen.has(type)) {
        this.ledger.leavesConcluded(0, 1)
        continue
      }

      matched += 1
      this.ledger.leavesConcluded(1, 0)
      this.pendingDetails.push({ dir: join(shiftDir, type), machine })
      this.ledger.detailQueued(1)
    }

    if (!matched) {
      branch.status = 'empty'
      branch.emptyReason = 'types-missing'
      branch.brokenAt = '类型'
      branch.message = seen.size
        ? `该班次下没有所选类型，实际存在：${summarize(typeDirs)}`
        : '该班次下没有类型目录'
    }
    // 类型目录找到了、只是还没读文件明细：交给 collectDetails 定性。

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
    this.ledger.enterCollect(queue.length > 0)
    this.touch('', true)

    // 不用 Promise.all(queue.map(...))：那样会把整个队列一次性派发下去，
    // 取消后已排队的读取仍会全部跑完，用户看到的「取消」要等几十秒才生效。
    // 改成 N 条泳道各自领活，每条泳道在领活前过 checkpoint，
    // 取消时立刻停下，只有正在读的那几个目录会自然收尾。
    let next = 0
    const lanes = Math.max(1, Math.min(this.readConcurrency, queue.length))

    logger.info('scan', 'scan.phase.collect', {
      taskId: this.id,
      detailTotal: queue.length,
      lanes,
    })

    const worker = async (): Promise<void> => {
      while (next < queue.length) {
        await this.checkpoint()

        if (this.lifecycle.signal.aborted) return

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
      // 硬改成 no-images 会把正确的诊断文案覆盖成"目录在、只是没图"，
      // 用户照着去查那个类型目录，结果那里根本不存在。
      if (branch.emptyReason === 'types-missing') continue

      // 走到这里说明类型目录找到了、但逐目录读下来一张图都没有。
      branch.status = 'empty'
      branch.emptyReason = 'no-images'
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
      if (branch.emptyReason !== 'no-images') continue

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
    if (this.lifecycle.signal.aborted) throw abortError()

    const branch = this.branches.find((entry) => entry.machine === item.machine)
    const typeRead = await this.read(item.dir)

    this.ledger.detailConcluded(typeRead.status === 'ok')

    if (!branch) return

    if (typeRead.status !== 'ok') {
      logger.debug('scan', 'scan.detail.failed', {
        taskId: this.id,
        machine: item.machine,
        dir: item.dir,
        status: typeRead.status,
        code: typeRead.code,
        error: typeRead.raw,
      })
      return
    }

    const images = typeRead.files.filter(isImageFile)

    if (!images.length) {
      branch.status = branch.status === 'hit' ? 'hit' : 'empty'
      return
    }

    logger.debug('scan', 'scan.detail.hit', {
      taskId: this.id,
      machine: item.machine,
      dir: item.dir,
      images: images.length,
    })

    branch.matchedDirs += 1
    branch.images += images.length
    branch.status = 'hit'
    branch.emptyReason = undefined
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
      this.breaker.sampleRead(false)
      this.recordSample(false)
    } else if (isNetworkError(result.status)) {
      this.progress.dirsUnreachable += 1
      this.breaker.sampleRead(true)
      this.recordSample(true)
    } else {
      // missing / denied 是路径或权限问题，不是网络不可达；
      // 不清零会让「网络×4 → 缺失目录 → 网络」被误判成连续断网
      this.breaker.sampleRead(false)
    }

    this.touch(path)

    return result
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
    this.ledger.leavesConcluded(0, this.leavesPerBranch)
    this.ledger.machineConcluded()

    // 分类、文案、断网样本统一由 diagnosis 决定；这里只落到 branch
    const diagnosis = describeLeafFailure({
      result,
      where,
      brokenAt,
      detail,
      baseName: this.shape.baseName,
    })

    // 能走到这里说明路径已经解析出来了，至少共享根是通的。
    // 只有真正的网络失败才算这台机台"连不上"。
    this.breaker.sampleMachine(!diagnosis.networkSample)

    branch.brokenAt = brokenAt
    branch.status = diagnosis.status
    branch.unreachableReason = diagnosis.reason
    branch.missingName = diagnosis.missingName
    branch.message = diagnosis.message
    branch.detail = diagnosis.detail

    this.ledger.machineProbed()

    const fields = {
      taskId: this.id,
      machine: branch.machine,
      where,
      brokenAt,
      status: result.status,
      code: result.code,
      elapsedMs: result.elapsedMs,
      message: branch.message,
      detail: branch.detail,
      error: result.raw,
    }

    if (branch.status === 'unreachable') {
      logger.warn('scan', 'scan.machine.broken', fields)
    } else {
      logger.debug('scan', 'scan.machine.broken', fields)
    }

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
    this.ledger.leavesConcluded(0, this.leavesPerBranch)

    branch.brokenAt = resolved.brokenAt ?? '共享名'
    branch.status = resolved.unreachable ? 'unreachable' : 'missing'
    branch.unreachableReason = resolved.unreachable
    branch.message = resolved.reason

    // 解析阶段的不可达也要计入熔断；否则整片断网时会逐台等超时
    if (resolved.unreachable === 'network') {
      this.progress.dirsUnreachable += 1
    }
    this.breaker.sampleRead(resolved.unreachable === 'network')
    // 只有网络不通才算「这台机台连不上」。未认证/无权限/无共享只是这台
    // 机台自身的问题，把它们算成失败会让新阈值在 39 台未认证时误判断网。
    this.breaker.sampleMachine(resolved.unreachable !== 'network')

    this.ledger.machineProbed()
    this.ledger.machineConcluded()

    logger.warn('scan', 'scan.machine.unresolved', {
      taskId: this.id,
      machine: branch.machine,
      reason: resolved.reason,
      brokenAt: branch.brokenAt,
      unreachable: resolved.unreachable,
    })

    this.touch(branch.machine, true)
  }

  // ---------------------------------------------------------------- 进度与节流

  private touch(currentPath: string, force = false): void {
    if (currentPath) this.progress.currentPath = currentPath

    // 计数器与派生值都由 ledger 维护，这里只把结果并进快照
    Object.assign(
      this.progress,
      this.ledger.project(Date.now(), this.lifecycle.startedAt),
    )

    this.lifecycle.touch(force)
  }

  /** 暂停/取消检查点：每个目录读取之前都会经过这里 */
  private checkpoint(): Promise<void> {
    return this.lifecycle.checkpoint()
  }
}
