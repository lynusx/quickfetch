import type { ScanPhase, ScanTaskProgress } from '../../../shared/ipc'

/**
 * 扫描进度账本。
 *
 * 以前 doneLeaves、dirsSkipped、detailTotal/detailDone、finishedMachines、
 * probedMachines 由执行器在十二个交错位置手工递增，percent/phase/ETA 又从
 * 这些计数器反推；「每个结束的 leaf 恰好计一次」没有 owner，每处递增的
 * 注释都是一次线上 bug。
 *
 * 这里把不变量收进一个 module，interface 是事件而不是计数器：执行器说
 * 「这台机台下结论了」「这批 leaf 命中/跳过」「明细入队/读完」，账本自己
 * 维护 phase、percent、ETA、machinesPending 与跳过数。
 */

/** 探测阶段在进度条上占的权重，其余留给收图 */
const PROBE_WEIGHT = 20
/** 逐目录读文件明细占的权重 */
const DETAIL_WEIGHT = 30

export interface ScanLedgerOptions {
  machines: number
  /** 单个机台分支的叶子数：有效时段 × 等级 × 类型 */
  leavesPerBranch: number
}

/** 账本负责的派生字段；执行器把它合并进 progress */
export type ScanLedgerProjection = Pick<
  ScanTaskProgress,
  | 'phase'
  | 'percent'
  | 'etaMs'
  | 'machinesPending'
  | 'detailsPending'
  | 'detailTotal'
  | 'detailDone'
  | 'dirsSkipped'
>

export interface ScanLedger {
  /** 机台探测成功（能继续往下读） */
  machineProbed: () => void
  /** 机台已经下结论：探测完成、解析失败、中途断链都算 */
  machineConcluded: () => void
  /** 一批 leaf 出了结论；hit + skipped 都要计入完成 */
  leavesConcluded: (hit: number, skipped: number) => void
  /** 待读明细入队 */
  detailQueued: (count: number) => void
  /** 一个明细读完；失败同时计入目录跳过 */
  detailConcluded: (ok: boolean) => void
  /** 进入明细阶段；没有待读目录时保持探测阶段 */
  enterCollect: (hasQueue: boolean) => void
  /** 全部完成 */
  finish: () => void
  /** 按当前事件流算出派生值 */
  project: (now: number, startedAt: number | null) => ScanLedgerProjection
}

export const createScanLedger = ({
  machines,
  leavesPerBranch,
}: ScanLedgerOptions): ScanLedger => {
  const totalLeaves = machines * leavesPerBranch

  let probedMachines = 0
  let finishedMachines = 0
  let doneLeaves = 0

  let detailTotal = 0
  let detailDone = 0
  let dirsSkipped = 0

  let phase: ScanPhase = 'probe'

  const percent = (): number => {
    if (phase === 'done') return 100

    const machineTotal = machines || 1
    const leafTotal = totalLeaves || 1

    const probeRatio = Math.min(1, probedMachines / machineTotal)
    const leafRatio = Math.min(1, doneLeaves / leafTotal)
    const detailRatio =
      detailTotal > 0 ? Math.min(1, detailDone / detailTotal) : 0

    // 探测 20%、叶子确定 50%、逐目录读明细 30%，三者都完成才是 100%
    return Math.min(
      100,
      Math.round(
        probeRatio * PROBE_WEIGHT +
          leafRatio * (100 - PROBE_WEIGHT - DETAIL_WEIGHT) +
          detailRatio * DETAIL_WEIGHT,
      ),
    )
  }

  const eta = (current: number, now: number, startedAt: number | null) => {
    if (current >= 100) return 0
    if (current < 5 || startedAt === null) return null

    const elapsed = now - startedAt
    const remaining = (elapsed / current) * (100 - current)

    return Number.isFinite(remaining) && remaining > 0
      ? Math.round(remaining)
      : null
  }

  return {
    machineProbed: () => {
      probedMachines += 1
    },
    machineConcluded: () => {
      finishedMachines += 1
    },
    leavesConcluded: (hit, skipped) => {
      doneLeaves += hit + skipped
      dirsSkipped += skipped
    },
    detailQueued: (count) => {
      detailTotal += count
    },
    detailConcluded: (ok) => {
      detailDone += 1
      if (!ok) dirsSkipped += 1
    },
    enterCollect: (hasQueue) => {
      phase = hasQueue ? 'collect' : 'probe'
    },
    finish: () => {
      phase = 'done'
    },
    project: (now, startedAt) => {
      const current = percent()

      return {
        phase,
        percent: current,
        etaMs: eta(current, now, startedAt),
        machinesPending: Math.max(0, machines - finishedMachines),
        detailsPending: Math.max(0, detailTotal - detailDone),
        detailTotal,
        detailDone,
        dirsSkipped,
      }
    },
  }
}
