import type { MachineInfo } from '@shared/ipc'
import type { PickableMachine } from './plant-machine-picker'

const trimTrailingSep = (value: string): string => value.replace(/[\\/]+$/, '')

/**
 * EL 机台映射到共享 picker 的形状。
 *
 * key 必须是纯机台名：elFilterStore 的 plantOf 按名字首字母判厂区，
 * 一旦拼成「厂区/机台」，切换厂区时选中会被整批清空。
 * host 存「DC 根目录\机台名」的绝对路径，供悬停 Tooltip 展示。
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
