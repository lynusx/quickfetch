import type { PlantFilterStore } from '../stores/plantFilterStore'
import { deriveScanParams } from '../scanParams'

interface UsePlantScanPageOptions {
  /** 该类别自己的 filter store；EL 也是同一个工厂的实例 */
  store: PlantFilterStore
  configured: boolean
  /** 森标 AOI 没有时段层 */
  hasSlots: boolean
  /** 利珀多一层等级 */
  requiresLevels: boolean
  /** 该类别的类型清单，用于区分「还没添加」与「添加了没勾」 */
  typeCatalog: string[]
}

/**
 * 从 filter store 取字段，交给纯函数 deriveScanParams。
 *
 * 页面因此只剩标题、入口/筛选节点与 picker；ready / missing / signature
 * 三份复制不再散在四个 page module 里。
 */
export const usePlantScanPage = ({
  store,
  configured,
  hasSlots,
  requiresLevels,
  typeCatalog,
}: UsePlantScanPageOptions) => {
  const plant = store((state) => state.plant)
  const selectedMachines = store((state) => state.selectedMachines)
  const date = store((state) => state.date)
  const shift = store((state) => state.shift)
  const slots = store((state) => state.slots)
  const types = store((state) => state.types)
  const levels = store((state) => state.levels)

  const derived = deriveScanParams({
    configured,
    plant,
    selectedMachines,
    date,
    shift,
    slots,
    types,
    levels,
    hasSlots,
    requiresLevels,
    typeCatalog,
  })

  return {
    ...derived,
    getParams: () => derived.params,
  }
}
