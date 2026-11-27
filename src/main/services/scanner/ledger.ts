import type { ScanPhase, ScanTaskProgress } from '../../../shared/ipc'

/**
 * 扫描进度账本（单机台均分单调模型）：`ScanTaskProgress` 全部 16 个字段的唯一 owner。
 *
 * ADR-0010 将扫描改为按机台升序分批流水线（单台完成前缀探测 → 叶子展开 → 目录收图与 stat）。
 * 旧的全局 `detailDone / detailTotal` 公式会在第 1 台读完时吃满 30% 明细权重，第 2 台入队时又把
 * 百分比拉回倒退，且 `phase` 在第 1 台收图后永久卡在 `collect`。
 *
 * 现在每台机台均分 `1 / M` 总进度份额：
 * - 单台内按「前缀探测 20% → 叶子展开 50% → 明细读取 30%」单调推进；
 * - 断链、无匹配时段或无匹配类型的机台在得出结论时直接结清本台 100% 份额；
 * - `phase` 按当前是否存在在途明细读取动态反映 `probe` / `collect`，`finish()` 后定格为 `done`。
 */

const MACHINE_PROBE_SHARE = 0.2
const MACHINE_LEAF_SHARE = 0.5
const MACHINE_DETAIL_SHARE = 0.3

interface MachineProgressSlot {
  probed: boolean
  concluded: boolean
  leavesDone: number
  detailTotal: number
  detailDone: number
}

export interface ScanLedgerOptions {
  machines: readonly string[]
  /** 单台机台的笛卡尔积叶子数（时段 × 等级 × 类型） */
  leavesPerBranch: number
  concurrency: number
  batchTotal: number
}

export interface DetailReadOutcome {
  ok: boolean
  hitImages?: number
}

export interface ScanLedger {
  /** 更新当前批次号（1-based） */
  setBatch: (batchIndex: number) => void
  /** 更新自适应并发档位 */
  setConcurrency: (concurrency: number) => void
  /** 更新当前正在访问的路径 */
  setCurrentPath: (currentPath: string) => void
  /** 记录一次网络层不可达计数 */
  recordUnreachable: () => void
  /** 单台机台读通到班次目录 */
  machineProbed: (machine: string) => void
  /** 单台机台下有若干叶子得出存在/缺失结论 */
  leavesConcluded: (machine: string, hit: number, skipped: number) => void
  /** 单台机台确认了待读取明细的叶子类型目录数 */
  detailQueued: (machine: string, count: number) => void
  /** 单台机台读完一个叶子类型目录的文件明细 */
  detailConcluded: (machine: string, outcome: DetailReadOutcome) => void
  /** 单台机台完整结束（无论命中、空目录、缺失还是不可达） */
  machineConcluded: (machine: string) => void
  /** 全部机台扫描流程收尾 */
  finish: () => void
  /** 生成完整的进度快照 */
  snapshot: (now: number, startedAt: number | null) => ScanTaskProgress
}

export const createScanLedger = ({
  machines,
  leavesPerBranch,
  concurrency: initialConcurrency,
  batchTotal,
}: ScanLedgerOptions): ScanLedger => {
  const slots = new Map<string, MachineProgressSlot>(
    machines.map((machine) => [
      machine,
      {
        probed: false,
        concluded: false,
        leavesDone: 0,
        detailTotal: 0,
        detailDone: 0,
      },
    ]),
  )

  let dirsScanned = 0
  let dirsHit = 0
  let dirsSkipped = 0
  let dirsUnreachable = 0
  let images = 0
  let currentPath = ''
  let concurrency = initialConcurrency
  let batchIndex = machines.length > 0 ? 1 : 0
  let detailTotal = 0
  let detailDone = 0
  let finishedMachines = 0
  let done = false
  let highWaterPercent = 0

  const slotOf = (machine: string): MachineProgressSlot | undefined =>
    slots.get(machine)

  const machineRatio = (slot: MachineProgressSlot): number => {
    if (slot.concluded) return 1

    const probePart = slot.probed ? MACHINE_PROBE_SHARE : 0
    const leafPart =
      leavesPerBranch > 0
        ? Math.min(1, slot.leavesDone / leavesPerBranch) * MACHINE_LEAF_SHARE
        : slot.probed
          ? MACHINE_LEAF_SHARE
          : 0
    const detailPart =
      slot.detailTotal > 0
        ? Math.min(1, slot.detailDone / slot.detailTotal) * MACHINE_DETAIL_SHARE
        : 0

    return Math.min(1, probePart + leafPart + detailPart)
  }

  const computePercent = (): number => {
    if (done) return 100
    if (machines.length === 0) return 0

    let sum = 0
    for (const slot of slots.values()) {
      sum += machineRatio(slot)
    }

    const raw = Math.min(100, Math.round((sum / machines.length) * 100))
    highWaterPercent = Math.max(highWaterPercent, raw)

    return highWaterPercent
  }

  const computePhase = (): ScanPhase => {
    if (done) return 'done'
    return detailTotal > detailDone ? 'collect' : 'probe'
  }

  const computeEta = (
    current: number,
    now: number,
    startedAt: number | null,
  ): number | null => {
    if (current >= 100) return 0
    if (current < 5 || startedAt === null) return null

    const elapsed = now - startedAt
    const remaining = (elapsed / current) * (100 - current)

    return Number.isFinite(remaining) && remaining > 0
      ? Math.round(remaining)
      : null
  }

  return {
    setBatch: (next) => {
      batchIndex = next
    },
    setConcurrency: (next) => {
      concurrency = next
    },
    setCurrentPath: (next) => {
      currentPath = next
    },
    recordUnreachable: () => {
      dirsUnreachable += 1
    },
    machineProbed: (machine) => {
      const slot = slotOf(machine)
      if (slot) slot.probed = true
    },
    leavesConcluded: (machine, hit, skipped) => {
      const slot = slotOf(machine)
      if (slot) slot.leavesDone += hit + skipped
      dirsSkipped += skipped
    },
    detailQueued: (machine, count) => {
      const slot = slotOf(machine)
      if (slot) slot.detailTotal += count
      detailTotal += count
    },
    detailConcluded: (machine, { ok, hitImages = 0 }) => {
      const slot = slotOf(machine)
      if (slot) slot.detailDone += 1
      detailDone += 1

      if (!ok) {
        dirsSkipped += 1
        return
      }

      dirsScanned += 1
      if (hitImages > 0) {
        dirsHit += 1
        images += hitImages
      }
    },
    machineConcluded: (machine) => {
      const slot = slotOf(machine)
      if (!slot || slot.concluded) return
      slot.concluded = true
      finishedMachines += 1
    },
    finish: () => {
      done = true
      currentPath = ''
      highWaterPercent = 100
    },
    snapshot: (now, startedAt) => {
      const percent = computePercent()

      return {
        phase: computePhase(),
        percent,
        dirsScanned,
        dirsHit,
        dirsSkipped,
        dirsUnreachable,
        images,
        currentPath,
        detailsPending: Math.max(0, detailTotal - detailDone),
        concurrency,
        batchIndex,
        batchTotal,
        detailTotal,
        detailDone,
        machinesPending: Math.max(0, machines.length - finishedMachines),
        etaMs: computeEta(percent, now, startedAt),
      }
    },
  }
}
