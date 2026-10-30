/**
 * 并发闸门：外部传入的任务排队进入，最多同时执行 concurrency 个。
 *
 * 并发数可运行时调整（扫描过程中根据失败率自动降档），
 * 因此不能像普通信号量那样「唤醒 N 个等待者」，否则降档后仍有旧批次的
 * 任务同时涌出，闸门就失效了。这里改为每完成一个任务就重新判断，
 * 按当前并发上限决定是否放行下一个。
 */
export interface Limiter {
  <T>(task: () => Promise<T>): Promise<T>
  /** 调整并发上限；调小不会打断正在执行的任务，只是不再放行新的 */
  setConcurrency(value: number): void
  /** 当前正在执行的任务数，用于让调用方决定是否值得插入新任务 */
  readonly active: number
}

export const createLimiter = (initial: number): Limiter => {
  let concurrency = Math.max(1, Math.floor(initial))
  let active = 0
  const waiting: (() => void)[] = []

  const pump = (): void => {
    while (active < concurrency && waiting.length > 0) {
      // 放行时直接占用名额，避免被放行的任务在下一轮循环里重复计数
      active += 1
      waiting.shift()?.()
    }
  }

  const limiter = async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= concurrency) {
      await new Promise<void>((resolve) => {
        waiting.push(resolve)
      })
    } else {
      active += 1
    }

    try {
      return await task()
    } finally {
      active -= 1
      pump()
    }
  }

  const wrapped = limiter as Limiter

  wrapped.setConcurrency = (value: number): void => {
    concurrency = Math.max(1, Math.floor(value))
    pump()
  }

  Object.defineProperty(wrapped, 'active', {
    get: () => active,
  })

  return wrapped
}

/**
 * 给单个操作套超时。网络盘抖动时 readdir 可能挂几十秒，
 * 不设上限会让整个任务看起来假死，也让并发名额被长期占住。
 */
export const withTimeout = <T>(
  run: Promise<T> | (() => Promise<T>),
  ms: number,
  onTimeout: () => Error,
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(onTimeout()), ms)
  })

  const promise = typeof run === 'function' ? run() : run

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}
