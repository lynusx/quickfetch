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

/** 机台结果的状态灯：网络不可达优先于普通失败 */
export const branchState = (branch: {
  status: string
  unreachableReason?: string
}): 'success' | 'danger' | 'warn' | 'muted' => {
  if (branch.unreachableReason === 'network') return 'danger'
  if (branch.status === 'hit') return 'success'
  if (branch.status === 'unreachable' || branch.status === 'missing') {
    return 'warn'
  }
  return 'muted'
}
