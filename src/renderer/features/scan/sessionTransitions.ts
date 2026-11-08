import type { ScanTaskStatus } from '@shared/ipc'
import { isFinalScanStatus } from '@shared/ipc'

/**
 * 扫描范围指纹变化时的处理。
 *
 * - adopt：只把新指纹记为基线（首次、任务还在跑）
 * - ignore：指纹没变
 * - reset：用户改了范围，把上一轮已结束的结果收起来
 *
 * 恢复历史不靠「跳过下一次变化」这种一次性开关 —— 如果恢复前后的
 * 指纹恰好相同，开关会留到用户下次真改范围时才被消费，结果清不掉。
 * 恢复流程在同步块里直接把基线推进到恢复后的指纹，这里只比较前后值。
 */
export type SignatureDecision = 'adopt' | 'ignore' | 'reset'

export const decideSignatureChange = (
  previous: string | null,
  next: string,
  taskStatus: ScanTaskStatus | null,
): SignatureDecision => {
  if (previous === null) return 'adopt'
  if (previous === next) return 'ignore'

  return taskStatus && isFinalScanStatus(taskStatus) ? 'reset' : 'adopt'
}
