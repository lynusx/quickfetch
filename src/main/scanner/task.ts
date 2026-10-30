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

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])

/** 同时进行的目录读取数：网络盘上并发能显著压低总耗时 */
const READ_CONCURRENCY = 8

/** 进度推送最小间隔，避免高频 IPC 压满渲染进程 */
const PROGRESS_INTERVAL_MS = 120

/** 连续不可达次数达到该值就怀疑网络盘断开，触发暂停而不是继续空转 */
const NETWORK_FAILURE_LIMIT = 5

/** 回传给渲染层的预览条数，全量结果留在主进程 */
const PREVIEW_LIMIT = 200

/** 探测阶段在进度条上占的权重，其余留给收图 */
const PROBE_WEIGHT = 20

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

  private branches: ScanBranch[] = []
  private images: ScannedImage[] = []
  private progress: ScanTaskProgress = emptyProgress()

  private totalLeaves = 0
  private doneLeaves = 0
  private probedMachines = 0
  private unreachableStreak = 0
  private lastEmitAt = 0

  constructor(
    params: ScanTaskParams,
    context: TaskContext,
    emit: (task: ScanTask) => void,
  ) {
    this.id = crypto.randomUUID()
    this.params = params
    this.context = context
    this.emit = emit

    // 分支顺序与机台选择顺序一致，并发完成时也不会乱序
    this.branches = params.machines.map((machine) => ({
      machine,
      status: 'skipped',
      matchedDirs: 0,
      images: 0,
    }))

    this.totalLeaves =
      params.machines.length * params.slots.length * params.types.length
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

      const limiter = createLimiter(READ_CONCURRENCY)

      // 机台之间并发，单个机台内部逐层向下
      await Promise.all(
        this.params.machines.map((machine) =>
          limiter(() => this.scanMachine(machine)),
        ),
      )

      this.progress.phase = 'done'
      this.progress.currentPath = ''
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
    }
  }

  private fail(message: string): void {
    this.status = 'failed'
    this.error = message
  }

  /** 单个机台分支：机台 → EL → 日期 → 班次 → 时段 → 类型 */
  private async scanMachine(machine: string): Promise<void> {
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
        { status: 'missing', dirs: [], files: [] },
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
        { status: 'missing', dirs: [], files: [] },
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
        { status: 'missing', dirs: [], files: [] },
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

    const limiter = createLimiter(READ_CONCURRENCY)
    const typeSeen = new Set<string>()

    // 第 5 层：时段 → 实际存在的类型；第 6 层：类型目录收图
    await Promise.all(
      hitSlots.map((slot) =>
        limiter(async () => {
          await this.checkpoint()

          const slotDir = join(shiftDir, slot)
          const slotRead = await this.read(slotDir)

          if (slotRead.status !== 'ok') {
            // 时段目录在列举后被删、或恰好无权限：按跳过处理，不阻断整次任务
            const skipped = this.params.types.length
            this.doneLeaves += skipped
            this.progress.dirsSkipped += skipped
            return
          }

          for (const type of slotRead.dirs) typeSeen.add(type)

          for (const type of this.params.types) {
            if (!slotRead.dirs.includes(type)) {
              this.doneLeaves += 1
              this.progress.dirsSkipped += 1
              continue
            }

            await this.checkpoint()

            const typeDir = join(slotDir, type)
            const typeRead = await this.read(typeDir)

            this.doneLeaves += 1

            if (typeRead.status !== 'ok') {
              this.progress.dirsSkipped += 1
              continue
            }

            const images = typeRead.files.filter(isImageFile)

            if (!images.length) continue

            branch.matchedDirs += 1
            this.progress.dirsHit += 1

            for (const name of images) {
              this.images.push({
                path: [
                  machine,
                  this.context.entry,
                  this.params.date,
                  this.params.shift,
                  slot,
                  type,
                  name,
                ].join('/'),
                absolutePath: join(typeDir, name),
                name,
              })
            }

            branch.images += images.length
            this.progress.images = this.images.length

            this.touch(typeDir)
          }

          this.touch(slotDir)
        }),
      ),
    )

    branch.availableTypes = [...typeSeen]

    if (branch.images > 0) {
      branch.status = 'hit'
    } else {
      branch.status = 'empty'
      branch.brokenAt = '类型'
      branch.message = `所选时段存在，但没有匹配的类型目录，实际存在：${summarize([...typeSeen])}`
    }

    this.touch(shiftDir, true)
  }

  /** 统一读取入口：负责网络故障计数与自动暂停 */
  private async read(path: string): Promise<DirReadResult> {
    await this.checkpoint()

    const result = await readDirSafe(path)

    if (isNetworkError(result.status)) {
      this.progress.dirsUnreachable += 1
      this.unreachableStreak += 1

      if (this.unreachableStreak >= NETWORK_FAILURE_LIMIT) {
        const root = await probePath(this.context.rootPath)

        // 根目录仍可达说明只是个别目录异常，重置计数继续；否则判定断连并暂停
        if (root.ok) {
          this.unreachableStreak = 0
        } else {
          this.pause('network')
        }
      }
    } else {
      this.unreachableStreak = 0
    }

    if (result.status === 'ok') this.progress.dirsScanned += 1

    this.touch(path)

    return result
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

    return Math.min(
      100,
      Math.round(probeRatio * PROBE_WEIGHT + leafRatio * (100 - PROBE_WEIGHT)),
    )
  }

  private touch(currentPath: string, force = false): void {
    if (currentPath) this.progress.currentPath = currentPath

    if (this.progress.phase !== 'done') {
      this.progress.phase =
        this.probedMachines >= this.params.machines.length ? 'collect' : 'probe'
    }

    this.progress.percent = this.computePercent()

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
