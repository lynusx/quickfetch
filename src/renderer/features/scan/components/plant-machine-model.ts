import type { AppSettings, MachineInfo, Plant, ScanCategory } from '@shared/ipc'

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

const trimTrailingSep = (value: string): string => value.replace(/[\\/]+$/, '')

/**
 * EL 机台映射到共享 picker 的形状。
 *
 * key 必须是纯机台名：EL 按名字首字母判厂区，一旦拼成「厂区/机台」，
 * 切换厂区或传入主进程时 key 会失配。
 */
export const elPickableMachines = (
  machines: MachineInfo[],
  entryRoot?: string | null,
): PickableMachine[] => {
  const root = entryRoot ? trimTrailingSep(entryRoot) : ''

  return machines.map((machine) => ({
    plant: machine.plant,
    name: machine.name,
    key: machine.name,
    host: root ? `${root}\\${machine.name}` : '',
    share: null,
    stale: false,
  }))
}

/** 按类别从配置提取统一形状的机台列表（含 stale） */
export const pickableMachinesFromSettings = (
  category: ScanCategory,
  settings: AppSettings | null,
): PickableMachine[] => {
  if (!settings) return []

  if (category === 'el') {
    const el = settings.categories.el
    return elPickableMachines(el.machines, el.entryRoot)
  }

  return settings.categories[category].machines
}

/** 机台名按自然序升序：7A 排在 10A 之前，跟现场习惯一致 */
export const compareNatural = (a: string, b: string): number =>
  a.localeCompare(b, 'zh-CN', { numeric: true })

/** 是否为 LX 类机台（如 A-LXJC-01、LX2）；自动默认选中时排除、排序置后，手动全选不排除 */
export const isLxMachine = (name: string): boolean => /lx/i.test(name)

/** 机台排序：普通机台在前、LX 机台置后，两组内部各自按自然数字升序 */
export const compareMachineName = (a: string, b: string): number => {
  const lxDiff = Number(isLxMachine(a)) - Number(isLxMachine(b))
  if (lxDiff !== 0) return lxDiff

  return compareNatural(a, b)
}

/** 计算指定厂区下默认选中的机台键（排除 stale 与 LX，并按可选谓词过滤） */
export const defaultSelectedKeys = (
  machines: PickableMachine[],
  targetPlant: Plant,
  predicate?: (machine: PickableMachine) => boolean,
): string[] => {
  const inTarget = machines.filter(
    (item) => !item.stale && item.plant === targetPlant,
  )
  const filtered = predicate ? inTarget.filter(predicate) : inTarget

  return filtered
    .filter((item) => !isLxMachine(item.name))
    .map((item) => item.key)
}

/**
 * 机台悬停展示的绝对路径（从主机名到机台固定标识或共享目录）。
 */
export const machinePath = (machine: PickableMachine): string => {
  const base = trimTrailingSep(machine.host)
  if (!base) return ''

  return machine.share ? `${base}\\${machine.share}` : base
}
