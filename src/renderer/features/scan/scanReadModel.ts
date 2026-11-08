import type { ScanTask, ScanTaskStatus } from '@shared/ipc'

import { formatDuration, formatEta } from '@/utils/common'
import {
  SCAN_STATUS_META,
  branchState,
  branchSummary,
  inaccessibleKindOf,
} from './components/scanStatus'
import type { InaccessibleKind } from './components/scanStatus'

/**
 * 扫描任务的展示模型。
 *
 * 复制页早已有纯 deriveCopyReadModel，扫描页却把统计、不可访问分组、
 * 阶段文案、ETA 与每行摘要 inline 算在 463 行的组件里；要测这些状态
 * 必须挂载整个面板并伪造完整 ScanTask。
 *
 * 这里只吃任务快照，输出可断言的 view model；组件退化为 renderer。
 */

const PHASE_LABEL: Record<string, string> = {
  probe: '探测目录',
  collect: '收集图片',
  done: '已结束',
}

export type BranchTone = 'success' | 'danger' | 'warn' | 'muted'

export interface ScanBranchRow {
  machine: string
  tone: BranchTone
  /** 不可访问原因；用于行上的 data-state 与分组 */
  kind: InaccessibleKind | null
  statusText: string
  imagesText: string
  /** 断链诊断全文，放进 title，不铺在行里 */
  detail: string | null
}

export interface InaccessibleCount {
  network: number
  auth: number
  denied: number
}

export interface ScanTaskView {
  status: (typeof SCAN_STATUS_META)[ScanTaskStatus] | null
  rows: ScanBranchRow[]
  /** 不是 hit/empty 的机台数，显示为「N 台无结果」 */
  abnormalCount: number
  inaccessible: InaccessibleCount
  hasInaccessible: boolean
  /** 只在运行中给出 */
  etaText: string | null
  machinesPending: number
  phaseDescription: string
}

const emptyInaccessible = (): InaccessibleCount => ({
  network: 0,
  auth: 0,
  denied: 0,
})

export const deriveScanTaskView = (task: ScanTask | null): ScanTaskView => {
  if (!task) {
    return {
      status: null,
      rows: [],
      abnormalCount: 0,
      inaccessible: emptyInaccessible(),
      hasInaccessible: false,
      etaText: null,
      machinesPending: 0,
      phaseDescription: '尚未开始扫描',
    }
  }

  const rows: ScanBranchRow[] = []
  const inaccessible = emptyInaccessible()
  let abnormalCount = 0

  // 行摘要、分组与异常计数共用一次遍历：分支最多几十台，但没必要跑三遍
  for (const branch of task.branches) {
    const summary = branchSummary(branch, task.params)
    const kind = inaccessibleKindOf(branch)

    rows.push({
      machine: branch.machine,
      tone: branchState(branch),
      kind,
      statusText: summary.statusText,
      imagesText: summary.imagesText,
      detail: branch.detail ?? null,
    })

    if (kind) inaccessible[kind] += 1
    if (branch.status !== 'hit' && branch.status !== 'empty') abnormalCount += 1
  }

  const hasInaccessible =
    inaccessible.network + inaccessible.auth + inaccessible.denied > 0

  const phaseDescription =
    task.status === 'interrupted'
      ? '上次退出时保存，可按原参数重新扫描'
      : task.progress.phase === 'done'
        ? SCAN_STATUS_META[task.status].label
        : PHASE_LABEL[task.progress.phase]

  return {
    status: SCAN_STATUS_META[task.status],
    rows,
    abnormalCount,
    inaccessible,
    hasInaccessible,
    etaText: task.status === 'running' ? formatEta(task.progress.etaMs) : null,
    machinesPending: task.progress.machinesPending,
    phaseDescription,
  }
}

/** 面板上的「用时」文案；单独导出便于测试 */
export const elapsedLabel = (task: ScanTask | null): string =>
  task ? formatDuration(task.elapsedMs) : '—'
