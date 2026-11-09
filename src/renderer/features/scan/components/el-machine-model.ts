import type { MachineInfo } from '@shared/ipc'
import type { PickableMachine } from './plant-machine-picker'

/**
 * EL 机台映射到共享 picker 的形状。
 *
 * key 必须是纯机台名：elFilterStore 的 plantOf 按名字首字母判厂区，
 * 一旦拼成「厂区/机台」，切换厂区时选中会被整批清空。
 * EL 没有共享名、stale 与主机地址，显式补空值而不是让共享组件猜。
 */
export const elPickableMachines = (
  machines: MachineInfo[],
): PickableMachine[] =>
  machines.map((machine) => ({
    plant: machine.plant,
    name: machine.name,
    key: machine.name,
    host: '',
    share: null,
    stale: false,
  }))
