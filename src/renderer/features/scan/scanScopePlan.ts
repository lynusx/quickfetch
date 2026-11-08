import type {
  AoiImageKind,
  AoiSide,
  AppSettings,
  ScanCategory,
  ScanHistoryItem,
} from '@shared/ipc'
import {
  aoiSideOfMachines,
  DEFAULT_AOI_IMAGE_KIND,
  elPlantOf,
} from '@shared/ipc'
import { SCAN_CATEGORY_META } from '@shared/scanCategories'

import { deriveScanParams } from './scanParams'
import type { ScanParamsResult } from './scanParams'
import type { PlantFilterSlice } from './stores/plantFilterStore'

/**
 * 扫描范围的纯规则：派生、历史回填计划、按入口/类型清单裁剪。
 *
 * 这里只依赖输入与 `@shared` 常量，不 import 任何 store 或 React，
 * 所以测试可以直接喂快照，不需要挂载页面。
 */

/** 派生只读这些字段；订阅时也只选这些，搜索词变化不该重算页面 */
export type ScanScopeState = Pick<
  PlantFilterSlice,
  | 'plant'
  | 'selectedMachines'
  | 'date'
  | 'shift'
  | 'slots'
  | 'types'
  | 'levels'
  | 'imageKind'
>

/** 把 store 快照喂给纯函数 deriveScanParams；类别差异在这里注入 */
export const deriveScope = (
  category: ScanCategory,
  state: ScanScopeState,
  configured: boolean,
  typeCatalog: string[],
): ScanParamsResult => {
  const meta = SCAN_CATEGORY_META[category]

  return deriveScanParams({
    configured,
    plant: state.plant,
    selectedMachines: state.selectedMachines,
    date: state.date,
    shift: state.shift,
    slots: state.slots,
    types: state.types,
    levels: state.levels,
    hasSlots: meta.hasSlots,
    requiresLevels: meta.requiresLevels,
    typeCatalog,
    imageKind: meta.hasImageKind ? state.imageKind : undefined,
  })
}

/** 历史参数回填到筛选面板的顺序；纯数据，便于测试 */
export interface FilterRestorePlan {
  /** 空串表示沿用当前厂区 */
  plant: string
  imageKind?: AoiImageKind
  side?: AoiSide
  machines: string[]
  date: string
  shift: '白班' | '夜班'
  slots: string[]
  types: string[]
  levels?: string[]
}

export const planFilterRestore = (
  category: ScanCategory,
  item: ScanHistoryItem,
): FilterRestorePlan => {
  const { machines: picked, date, shift, slots, types, levels } = item.params

  if (category === 'el') {
    // 厂区跟着历史里的第一台机台走：否则机台已选中却不在当前厂区的
    // 列表里，用户只看到「机台 3/10」却找不到高亮的那几个。
    return {
      plant: picked.length ? (elPlantOf(picked[0]) ?? '') : '',
      machines: picked,
      date,
      shift,
      slots,
      types,
    }
  }

  // 复合键「厂区/机台」的第一段就是厂区
  const plant = picked[0]?.split('/')[0] ?? ''

  if (category === 'aoi') {
    return {
      plant,
      // 图片类型决定重扫时读哪个目录，缺省按整张扫描图处理（老记录）
      imageKind: item.params.aoiImageKind ?? DEFAULT_AOI_IMAGE_KIND,
      // 推断成「全部」时不会裁掉任何机台，恢复结果与历史一致
      side: aoiSideOfMachines(picked),
      machines: picked,
      date,
      shift,
      // 森标 AOI 没有时段层，历史里即使残留了值也不带回去
      slots: [],
      types,
    }
  }

  return {
    plant,
    machines: picked,
    date,
    shift,
    slots,
    types,
    // 等级只有利珀有；力禧特的路径里没有这一层，传了也没意义
    levels: category === 'pl' && levels?.length ? levels : undefined,
  }
}

/** 当前类别仍在入口里的机台；EL 是机台名，其余是「厂区/机台」复合键 */
export const activeMachineKeys = (
  category: ScanCategory,
  settings: AppSettings | null,
): string[] => {
  if (!settings) return []

  if (category === 'el') {
    return settings.categories.el.machines.map((item) => item.name)
  }

  const entry = settings.categories[category]

  return entry.machines.filter((item) => !item.stale).map((item) => item.key)
}

/** 按当前类型清单裁掉已不存在的勾选 */
export const aliveTypes = (
  category: ScanCategory,
  settings: AppSettings | null,
  types: string[],
): string[] => {
  const catalog = settings?.categories[category].typeCatalog ?? []

  return types.filter((type) => catalog.includes(type))
}
