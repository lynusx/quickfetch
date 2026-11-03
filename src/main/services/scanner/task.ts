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
        this.touch('', true)

        await Promise.all(
          batches[index].map((machine) => this.scanMachine(machine, limiter)),
        )
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
    const baseRead = await this.read(base)

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

    // 无时段层（森标 AOI）：班次目录下直接就是类型目录
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

    // 最终状态在 collectDetails 里判定：只有真读到图片才算命中
    if (!typeSeen.size) {
      branch.status = 'empty'
      branch.brokenAt = '类型'
      branch.message = `所选时段存在，但没有匹配的类型目录，实际存在：（空目录）`
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
    if (!this.pendingDetails.length) return

    this.progress.detailTotal = this.detailTotal
    this.touch('', true)

    const queue = this.pendingDetails.splice(0)

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

      // 走到这里说明类型目录找到了、但逐目录读下来一张图都没有。
      // 必须改写文案而不是沿用旧 message：探测阶段留下的「没有所选类型」
      // 在这一步已经确定是错的（类型明明存在），留着就是误导。
      //
      // 数字要写人话：第一版写成「已匹配 0 个目录，共 0 张」，现场反馈
      // 看了不知道是"目录没找到"还是"目录空"。但这里读的是文件、不是目录，
      // 「检查了几个目录」得回探测阶段的 availableTypes 里算，不能拿
      // matchedDirs（有图才算，这里必然为 0）。
      branch.status = 'empty'
      branch.brokenAt = '未命中'
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

  /** 统一读取入口：超时、网络故障计数、自适应降档与自动暂停都在这里 */
  private async read(path: string): Promise<DirReadResult> {
    await this.checkpoint()

    const result = await readDirSafe(path, { timeoutMs: this.timeoutMs })

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
   * 维护连续不可达计数，达到阈值就暂停任务等用户接回网络。
   *
   * 目录读取和解析器探测共用同一个计数：力禧特/利珀在解析阶段就可能
   * 遇到整片断网，只统计 read() 的话任务会逐台等完超时才停。
   */
  private noteReachability(unreachable: boolean): void {
    if (!unreachable) {
      this.unreachableStreak = 0
      return
    }

    this.unreachableStreak += 1

    // 力禧特各机台不同 IP，没有共同根可复探；连续不可达只能说明整批
    // 都不在这张网里，直接暂停让用户接入专用内网后继续。
    // EL 虽然共享一个根，但续探根目录会让每个批次多一次网络往返，
    // 而现场的断网往往整片发生，直接暂停后由用户确认恢复更省事。
    if (this.unreachableStreak >= NETWORK_FAILURE_LIMIT) {
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
      branch.message = `「${where}」下没有「${detail.expected}」，实际存在：${summarize(detail.actual)}`
    } else {
      branch.status = 'missing'
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

    this.probedMachines += 1
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
