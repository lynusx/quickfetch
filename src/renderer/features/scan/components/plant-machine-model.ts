import type { ReactNode } from 'react'
import type { Plant } from '@shared/ipc'

export interface PickableMachine {
  plant: Plant
  name: string
  key: string
  host: string
  /**
   * 第二层目录的探测状态：null 未探测、'' 探过但没有、其余为名字。
   * 力禧特是 el / SaveImages，利珀是 pl-6a 这类标识目录名。
   */
  share: string | null
  stale: boolean
}

/**
 * 机台列表的额外过滤与空态文案。
 *
 * 用带 `test` 的函数而不是布尔开关：调用方决定「筛掉哪些机台」，
 * 基座只负责在厂区过滤之后、关键词之前应用，不关心为什么筛。
 */
export interface MachineListFilter {
  test: (machine: PickableMachine) => boolean
  /** 过滤后列表为空时的文案；不传用「没有可用机台」 */
  emptyText?: ReactNode
}

/** 机台名按自然序升序：7A 排在 10A 之前，跟现场习惯一致 */
export const compareNatural = (a: string, b: string): number =>
  a.localeCompare(b, 'zh-CN', { numeric: true })

/** 是否为 LX 类机台（如 A-LXJC-01、LX2）；自动默认选中时排除、排序置后，手动全选不排除 */
const isLxMachine = (name: string): boolean => /lx/i.test(name)

/** 机台排序：普通机台在前、LX 机台置后，两组内部各自按自然数字升序 */
export const compareMachineName = (a: string, b: string): number => {
  const lxDiff = Number(isLxMachine(a)) - Number(isLxMachine(b))
  if (lxDiff !== 0) return lxDiff

  return compareNatural(a, b)
}

/** 计算指定厂区下默认选中的机台键（排除 stale 与 LX，并尊重调用方的额外过滤如 AOI 检测面） */
export const defaultSelectedKeys = (
  machines: PickableMachine[],
  targetPlant: Plant,
  machineFilter?: MachineListFilter,
): string[] => {
  const inTarget = machines.filter(
    (item) => !item.stale && item.plant === targetPlant,
  )
  const filtered = machineFilter
    ? inTarget.filter((item) => machineFilter.test(item))
    : inTarget

  return filtered
    .filter((item) => !isLxMachine(item.name))
    .map((item) => item.key)
}

/**
 * 机台悬停展示的绝对路径（从主机名到机台固定标识或共享目录）。
 *
 * - EL：host 已拼好 `entryRoot\机台名`，share 为 null
 * - 力禧特 / 利珀：有 share 时拼 `host\share`，未探测或无共享仅展示 host
 * - 森标 AOI：share 恒为 null，仅展示 host
 */
export const machinePath = (machine: PickableMachine): string => {
  const base = machine.host.replace(/[\\/]+$/, '')
  if (!base) return ''

  return machine.share ? `${base}\\${machine.share}` : base
}
