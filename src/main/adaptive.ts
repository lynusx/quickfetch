/**
 * 失败率自适应降档的采样器。
 *
 * 扫描和复制都是「在共享盘上做大量 IO，机器只有 8G」的场景：
 * 网络一抖就会大面积失败，固定并发要么太保守跑得慢、要么太激进直接雪崩。
 * 所以统一按窗口统计失败率，超过阈值就降一档并发。
 *
 * 只降不升是刻意的：现场是「跑完就行」的场景，反复升档试探只会让
 * 已经吃紧的机器更抖。降到 1 就不再降，避免退化成完全串行。
 */
export interface AdaptiveGateOptions {
  /** 起始并发 */
  initial: number
  /** 下限，默认 1 */
  min?: number
  /** 每采这么多次做一次判断 */
  window?: number
  /** 窗口内失败占比超过该值就降档 */
  failRatio?: number
  /** 降档后的回调，调用方用它同步限流器与超时 */
  onChange?: (concurrency: number, ratio: number) => void
}

export interface AdaptiveGate {
  readonly concurrency: number
  /** 采一次样本；返回 true 表示这一样本触发了降档 */
  sample: (failed: boolean) => boolean
  /** 新任务开始时重置窗口计数（已经降下去的档位不回升） */
  reset: () => void
}

const DEFAULT_WINDOW = 20
const DEFAULT_FAIL_RATIO = 0.25

export const createAdaptiveGate = (
  options: AdaptiveGateOptions,
): AdaptiveGate => {
  const min = Math.max(1, Math.floor(options.min ?? 1))
  const window = Math.max(1, Math.floor(options.window ?? DEFAULT_WINDOW))
  const failRatio = options.failRatio ?? DEFAULT_FAIL_RATIO

  let concurrency = Math.max(min, Math.floor(options.initial))
  let reads = 0
  let failures = 0

  return {
    get concurrency() {
      return concurrency
    },

    sample(failed: boolean): boolean {
      reads += 1
      if (failed) failures += 1

      if (reads < window) return false

      const ratio = failures / reads
      reads = 0
      failures = 0

      if (ratio <= failRatio || concurrency <= min) return false

      concurrency -= 1
      options.onChange?.(concurrency, ratio)

      return true
    },

    reset(): void {
      reads = 0
      failures = 0
    },
  }
}

/**
 * 并发越低，单次读取能容忍的时间越短。
 *
 * 并发 4 时给满上限；降到 1 时只给下限 —— 网络真断了就该尽快失败，
 * 而不是每读一个目录都空等满超时。
 */
export const timeoutForConcurrency = (
  concurrency: number,
  base: number,
  minTimeout: number,
  maxTimeout: number,
): number => {
  if (base <= 1) return maxTimeout

  const ratio = (concurrency - 1) / (base - 1)

  return Math.round(
    Math.min(
      maxTimeout,
      Math.max(minTimeout, minTimeout + ratio * (maxTimeout - minTimeout)),
    ),
  )
}
