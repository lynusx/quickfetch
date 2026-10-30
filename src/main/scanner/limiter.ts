/**
 * 极简并发闸门：外部传入的任务排队进入，最多同时执行 concurrency 个。
 * 扫描网络盘时 readdir 的延迟远高于本地盘，并发能把总耗时压下来。
 */
export const createLimiter = (concurrency: number) => {
  let active = 0
  const waiting: (() => void)[] = []

  const release = (): void => {
    active -= 1
    waiting.shift()?.()
  }

  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= concurrency) {
      await new Promise<void>((resolve) => waiting.push(resolve))
    }

    active += 1

    try {
      return await task()
    } finally {
      release()
    }
  }
}
