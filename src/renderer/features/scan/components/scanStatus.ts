import type { ScanBranch, ScanTaskParams, ScanTaskStatus } from '@shared/ipc'

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

/** 不可达原因 → 状态列短文案 */
const REASON_TEXT: Record<string, string> = {
  network: '网络不通',
  auth: '未认证',
  denied: '无权限',
  share: '共享未找到',
}

/** 楼层名兜底：新结果优先用 missingName，旧历史没有时按层名/参数显示 */
const layerName = (
  brokenAt: ScanBranch['brokenAt'],
  params?: ScanTaskParams,
): string | null => {
  switch (brokenAt) {
    case 'EL':
      return 'EL'
    case '共享名':
      return '共享'
    case '机台标识':
      return '机台标识'
    case '机台名':
      return '机台名'
    case '日期':
      return params?.date ?? '日期'
    case '班次':
      return params?.shift ?? '班次'
    case '时段':
      return params?.slots.length ? params.slots.join('/') : '时段'
    case '等级':
      return '等级'
    case '类型':
      return '类型'
    default:
      return null
  }
}

/**
 * 从旧的完整 message 里提取缺失目录名。
 *
 * 历史记录原样保存了 message，旧记录没有 missingName；这里只做展示层收敛，
 * 兼容既有 JSON。
 */
const missingNameFromMessage = (message?: string): string | null => {
  if (!message) return null

  const nested = /下没有「([^」]+)」/.exec(message)
  if (nested) return nested[1]

  const missing = /「([^」]+)」不存在/.exec(message)
  if (missing) return missing[1].split(/[\\/]/).filter(Boolean).pop() ?? null

  return null
}

export interface BranchSummary {
  /** 状态列文案 */
  statusText: string
  /** 图片列文案：目录存在但没图时是「0 张」，不可访问时是「—」 */
  imagesText: string
}

/**
 * 机台结果行的展示文案。
 *
 * 状态列只回答「这行是什么情况」，不再把完整路径与「实际存在：…」铺出来；
 * 诊断全文仍留在 branch.message/detail 里（历史 JSON 可查）。
 */
export const branchSummary = (
  branch: ScanBranch,
  params?: ScanTaskParams,
): BranchSummary => {
  const reason = branch.unreachableReason

  if (reason) {
    return {
      statusText: REASON_TEXT[reason] ?? '不可访问',
      imagesText: '—',
    }
  }

  if (branch.status === 'skipped') {
    return { statusText: '未探测', imagesText: '—' }
  }

  if (branch.status === 'hit') {
    return {
      statusText: `${branch.matchedDirs} 个目录`,
      imagesText: `${branch.images} 张`,
    }
  }

  if (branch.status === 'empty') {
    return {
      statusText:
        branch.brokenAt === '类型'
          ? '没有所选类型'
          : branch.brokenAt === '未命中'
            ? '目录内无图片'
            : '无图片',
      imagesText: '0 张',
    }
  }

  if (branch.status === 'missing') {
    // 新结果有结构化 missingName；旧历史从 message 提取；再不行按层名兜底
    if (branch.missingName) {
      return {
        statusText: `${branch.missingName} 目录不存在`,
        imagesText: '0 张',
      }
    }

    const extracted = missingNameFromMessage(branch.message)
    if (extracted) {
      return { statusText: `${extracted} 目录不存在`, imagesText: '0 张' }
    }

    // 「该机台已不在入口目录中」这类短原因保留原文，别改成误导的目录名
    if (branch.message && branch.message.length <= 24) {
      return { statusText: branch.message, imagesText: '0 张' }
    }

    const name = layerName(branch.brokenAt, params)
    if (name) return { statusText: `${name} 目录不存在`, imagesText: '0 张' }

    return { statusText: '目录不存在', imagesText: '0 张' }
  }

  return { statusText: '不可访问', imagesText: '—' }
}
