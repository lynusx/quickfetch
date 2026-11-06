import { logger } from '../log'

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

export interface BreakerStats {
  batchReachable: number
  batchFailed: number
  unreachableMachineStreak: number
}

export interface Breaker {
  /** 按读取次数采样：成功/非网络失败都算「可达」 */
  sampleRead(unreachable: boolean): void
  /** 按机台采样：这一台最终是否网络不可达 */
  sampleMachine(reachable: boolean): void
  /** 一批开始，清空批内计数（跨批的连续不可达保留） */
  beginBatch(): void
  /** 一批结束，累计连续不可达台数，达到阈值就暂停 */
  endBatch(): void
  /** 用户点「继续」：清空全部样本与累计 */
  reset(): void
  stats(): BreakerStats
}

export interface BreakerOptions {
  taskId: string
  /** 只有运行中才允许自动暂停；已暂停/取消的任务不再触发 */
  isRunning: () => boolean
  onPause: () => void
}

/**
 * 断网熔断：两条独立规则共用一个 module。
 *
 * - 按读取次数的滑动窗口，判「整片断网」；
 * - 按机台的跨批累计，AOI 这种一批 2 台的场景更早给出信号。
 *
 * 策略只在这里，执行器只负责喂样本；阈值边界因此可以不启动扫描就测。
 */
export const createBreaker = ({
  taskId,
  isRunning,
  onPause,
}: BreakerOptions): Breaker => {
  const window: boolean[] = []
  let batchReachable = 0
  let batchFailed = 0
  let streak = 0

  const resetBatch = (): void => {
    batchReachable = 0
    batchFailed = 0
  }

  return {
    sampleRead(unreachable) {
      window.push(unreachable)

      if (window.length > NETWORK_FAILURE_WINDOW) window.shift()

      // 样本太少时不下结论：整片断网时前几台就会连续失败，
      // 一凑够几个就判定会被"5 台不通、3 台正常"这种局部故障骗到
      // （窗口里只有 5 个失败样本，比例 100%，实际整体才 62%）。
      if (window.length < NETWORK_FAILURE_MIN) return

      const failed = window.filter(Boolean).length
      const ratio = failed / window.length

      if (ratio < NETWORK_FAILURE_RATIO) return
      if (!isRunning()) return

      logger.warn('scan', 'scan.network.window', {
        taskId,
        failed,
        window: window.length,
        ratio,
      })

      onPause()
    },

    sampleMachine(reachable) {
      if (reachable) batchReachable += 1
      else batchFailed += 1
    },

    beginBatch() {
      resetBatch()
    },

    endBatch() {
      if (batchReachable > 0) {
        streak = 0
      } else if (batchFailed > 0) {
        streak += batchFailed
      }

      resetBatch()

      if (streak >= BATCH_UNREACHABLE_MIN && isRunning()) {
        logger.warn('scan', 'scan.network.streak', {
          taskId,
          unreachableMachines: streak,
          threshold: BATCH_UNREACHABLE_MIN,
        })

        onPause()
      }
    },

    reset() {
      window.length = 0
      resetBatch()
      streak = 0
    },

    stats: () => ({
      batchReachable,
      batchFailed,
      unreachableMachineStreak: streak,
    }),
  }
}
