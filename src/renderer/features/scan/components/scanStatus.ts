import type { ScanTaskStatus } from '@shared/ipc'

type BadgeColor = 'gray' | 'blue' | 'amber' | 'green' | 'orange' | 'red'
type BadgeVariant = 'solid' | 'soft' | 'outline' | 'surface'

export const SCAN_STATUS_META: Record<
  ScanTaskStatus,
  { label: string; color: BadgeColor; variant: BadgeVariant }
> = {
  pending: { label: '待开始', color: 'gray', variant: 'outline' },
  running: { label: '进行中', color: 'blue', variant: 'soft' },
  paused: { label: '已暂停', color: 'amber', variant: 'soft' },
  completed: { label: '已完成', color: 'green', variant: 'soft' },
  canceled: { label: '已取消', color: 'gray', variant: 'surface' },
  interrupted: { label: '已中断', color: 'orange', variant: 'soft' },
  failed: { label: '失败', color: 'red', variant: 'soft' },
}

/**
 * 机台结果的状态灯。
 *
 * 四档语气对应四种处理方向，现场看图就知道下一步做什么：
 * - danger：网络不通，去连 JA-PDA
 * - warn：读不通（多半没认证）/ 没权限 / 目录缺失，去认证或核对路径
 * - success：有图
 * - muted：探测过但没有图
 */
export const branchState = (branch: {
  status: string
  unreachableReason?: string
}): 'success' | 'danger' | 'warn' | 'muted' => {
  if (branch.unreachableReason === 'network') return 'danger'
  // 未认证与无权限都不是「路径写错了」，别用同一个灰点糊过去
  if (branch.unreachableReason === 'auth') return 'warn'
  if (branch.unreachableReason === 'denied') return 'warn'
  if (branch.status === 'hit') return 'success'
  if (branch.status === 'unreachable' || branch.status === 'missing') {
    return 'warn'
  }
  return 'muted'
}

/** 不可访问的三类原因，用于顶部分类统计与结果行的分组标题 */
export type InaccessibleKind = 'network' | 'auth' | 'denied'

export const inaccessibleKindOf = (branch: {
  unreachableReason?: string
}): InaccessibleKind | null => {
  const reason = branch.unreachableReason

  return reason === 'network' || reason === 'auth' || reason === 'denied'
    ? reason
    : null
}

/** 把主进程给的绝对路径还原成可打开的共享地址；取到 \\IP\share 这一段 */
export const shareUrlOf = (branch: {
  message?: string
  detail?: string
}): string | null => {
  const source = branch.message ?? ''
  const match = /\\\\[^\s，）」]+/.exec(source)

  return match ? match[0] : null
}
