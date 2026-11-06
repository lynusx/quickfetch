import { useCallback } from 'react'

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
  /** 是否有「整体/局部」可选；只有森标 AOI 用得到 */
  hasImageKind?: boolean
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
  hasImageKind = false,
}: UsePlantScanPageOptions) => {
  const plant = store((state) => state.plant)
  const selectedMachines = store((state) => state.selectedMachines)
  const date = store((state) => state.date)
  const shift = store((state) => state.shift)
  const slots = store((state) => state.slots)
  const types = store((state) => state.types)
  const levels = store((state) => state.levels)
  const imageKind = store((state) => state.imageKind)

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
    imageKind: hasImageKind ? imageKind : undefined,
  })

  /**
   * 按 store 的**当前**状态重算指纹。
   *
   * 历史恢复会在同一个同步块里改完筛选；渲染时捕获的 derived 还是旧值，
   * 所以恢复流程需要在改完之后再问一次「现在的指纹是什么」。
   */
  const getSignature = useCallback(() => {
    const state = store.getState()

    return deriveScanParams({
      configured,
      plant: state.plant,
      selectedMachines: state.selectedMachines,
      date: state.date,
      shift: state.shift,
      slots: state.slots,
      types: state.types,
      levels: state.levels,
      hasSlots,
      requiresLevels,
      typeCatalog,
      imageKind: hasImageKind ? state.imageKind : undefined,
    }).filterSignature
  }, [store, configured, hasSlots, requiresLevels, typeCatalog, hasImageKind])

  return {
    ...derived,
    getParams: () => derived.params,
    getSignature,
  }
}
