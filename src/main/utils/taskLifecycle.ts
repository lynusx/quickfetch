/**
 * 扫描与复制共用的任务生命周期。
 *
 * 两个执行器原来各自维护暂停等待队列、中断信号、终态 promise、进度节流与
 * 心跳，语义还故意不同（扫描的终态只建一次，复制每轮重建，否则 retry 会
 * 立刻返回）。规则散在两处，修一次生命周期要改两遍，而且哪条规则适用于
 * 哪种任务没有任何 interface 说明。
 *
 * 这里只保留一份：`begin()` 每轮重建终态 promise 与中断信号，于是复制
 * 的 retry、扫描的单轮启动都得到同一条规则；暂停时长、节流时钟与心跳也
 * 由它维护。执行器只负责自己那层业务状态与快照。
 */

export type TaskStatus =
  'pending' | 'running' | 'paused' | 'completed' | 'canceled' | 'failed'

export type PauseReason = 'user' | 'network'

type FinalStatus = Extract<TaskStatus, 'completed' | 'canceled' | 'failed'>

export interface TaskLifecycleOptions {
  /** 推送一份新快照；节流由 lifecycle 负责 */
  emit: () => void
  /** 运行中按固定间隔强制推送；不传就没有心跳 */
  tickEveryMs?: number
  /** 心跳前的领域刷新（如网速采样），随后仍会强制推送 */
  onTick?: () => void
  /** 取消时 checkpoint 抛出的错误文案 */
  cancelMessage?: string
  /** 进度推送最小间隔 */
  throttleMs?: number
}

export interface TaskLifecycle {
  readonly status: TaskStatus
  readonly pauseReason: PauseReason | null
  readonly startedAt: number | null
  readonly finishedAt: number | null
  readonly signal: AbortSignal
  /** 暂停累计时长，含当前正在暂停的这一段 */
  pausedMs(now?: number): number
  begin(): boolean
  pause(reason?: PauseReason): boolean
  resume(): boolean
  cancel(): boolean
  finish(status: FinalStatus): boolean
  settle(): void
  waitSettled(): Promise<boolean>
  touch(force?: boolean): void
  checkpoint(): Promise<void>
}

const DEFAULT_THROTTLE_MS = 120

const isFinalStatus = (status: TaskStatus): boolean =>
  status === 'completed' || status === 'canceled' || status === 'failed'

export const createTaskLifecycle = (
  options: TaskLifecycleOptions,
): TaskLifecycle => {
  const throttleMs = options.throttleMs ?? DEFAULT_THROTTLE_MS
  const cancelMessage = options.cancelMessage ?? '任务已取消'

  let status: TaskStatus = 'pending'
  let pauseReason: PauseReason | null = null
  let startedAt: number | null = null
  let finishedAt: number | null = null

  let paused = false
  let pausedAt: number | null = null
  let pausedAccum = 0
  let resumeWaiters: (() => void)[] = []

  let abortController = new AbortController()
  let settled: Promise<boolean> = Promise.resolve(true)
  let markSettled: (ok: boolean) => void = () => {}
  let settledDone = true

  let lastEmitAt = 0
  let ticker: ReturnType<typeof setInterval> | null = null

  const cancelError = (): Error => {
    const error = new Error(cancelMessage)
    error.name = 'AbortError'
    return error
  }

  const flushPaused = (now: number): void => {
    if (pausedAt !== null) {
      pausedAccum += now - pausedAt
      pausedAt = null
    }
  }

  const touch = (force = false): void => {
    const now = Date.now()

    if (!force && now - lastEmitAt < throttleMs) return

    lastEmitAt = now
    options.emit()
  }

  const startTicker = (): void => {
    if (!options.tickEveryMs || ticker) return

    ticker = setInterval(() => {
      if (status !== 'running') return

      options.onTick?.()
      touch(true)
    }, options.tickEveryMs)

    // 不让心跳拖住进程退出
    ticker.unref?.()
  }

  const stopTicker = (): void => {
    if (!ticker) return

    clearInterval(ticker)
    ticker = null
  }

  const releaseWaiters = (): void => {
    const waiters = resumeWaiters
    resumeWaiters = []
    for (const resolve of waiters) resolve()
  }

  const lifecycle: TaskLifecycle = {
    get status() {
      return status
    },

    get pauseReason() {
      return pauseReason
    },

    get startedAt() {
      return startedAt
    },

    get finishedAt() {
      return finishedAt
    },

    get signal() {
      return abortController.signal
    },

    pausedMs(now = Date.now()) {
      return pausedAccum + (pausedAt !== null ? now - pausedAt : 0)
    },

    /** 开始一轮执行；终态 promise 与中断信号都换新，retry 才不会秒退 */
    begin() {
      if (status === 'running' || status === 'paused') return false

      const now = Date.now()

      status = 'running'
      pauseReason = null
      startedAt = now
      finishedAt = null
      paused = false
      pausedAt = null
      pausedAccum = 0
      abortController = new AbortController()
      settledDone = false
      settled = new Promise<boolean>((resolve) => {
        markSettled = resolve
      })
      lastEmitAt = 0

      startTicker()

      return true
    },

    pause(reason = 'user') {
      if (status !== 'running') return false

      paused = true
      pauseReason = reason
      status = 'paused'
      pausedAt = Date.now()

      stopTicker()

      return true
    },

    resume() {
      if (status !== 'paused') return false

      flushPaused(Date.now())
      paused = false
      pauseReason = null
      status = 'running'

      startTicker()
      releaseWaiters()

      return true
    },

    cancel() {
      if (isFinalStatus(status)) return false

      abortController.abort()
      flushPaused(Date.now())
      paused = false
      stopTicker()
      releaseWaiters()

      // 立即反馈状态，不等执行体在下一个检查点退出
      status = 'canceled'
      finishedAt = Date.now()

      return true
    },

    /** 执行体收尾；已经被 cancel() 定稿时不再覆盖 */
    finish(next) {
      if (isFinalStatus(status)) return false

      flushPaused(Date.now())
      paused = false
      stopTicker()

      status = next
      finishedAt = Date.now()

      return true
    },

    settle() {
      if (settledDone) return

      settledDone = true
      markSettled(true)
    },

    waitSettled() {
      return settled
    },

    touch,

    /** 暂停/取消检查点：每个目录读取、每个文件粘贴前都会经过这里 */
    async checkpoint() {
      if (abortController.signal.aborted) throw cancelError()

      while (paused) {
        await new Promise<void>((resolve) => {
          resumeWaiters.push(resolve)
        })
      }

      if (abortController.signal.aborted) throw cancelError()
    },
  }

  return lifecycle
}
