import type { AppSettings, ScanCategory, ScanHistoryItem } from '@shared/ipc'

import type { ScanParamsResult } from './scanParams'
import {
  activeMachineKeys,
  aliveTypes,
  deriveScope,
  planFilterRestore,
} from './scanScopePlan'
import { useAoiFilterStore } from './stores/aoiFilterStore'
import { useElFilterStore } from './stores/elFilterStore'
import { useLxtFilterStore } from './stores/lxtFilterStore'
import type { PlantFilterStore } from './stores/plantFilterStore'
import { usePlFilterStore } from './stores/plFilterStore'

/**
 * 扫描范围（厂区 / 机台 / 日期 / 班次 / 时段 / 类型）的唯一落点。
 *
 * 以前同一条不变量散在五个 module：ready/missing/signature 在
 * usePlantScanPage，历史回填、按 catalog 裁类型、按入口裁机台、
 * 回落第一个厂区在 useHistoryRestore，seed 默认值又在两个筛选面板
 * 与 picker 的 effect 里。改一条规则要同时读五处，`restore()` 还必须
 * 在同步块里重跑归一化，因为 effect 顺序不可靠。
 *
 * 现在类别差异只体现为 descriptor 与一张 store 表；派生、回填与归一化
 * 都从这里走，页面与 hook 不再各自知道 AOI 有没有时段层、利珀要不要等级。
 * 纯规则在 scanScopePlan，本文件只把规则接到具体 store 上。
 */

const FILTER_STORES: Record<ScanCategory, PlantFilterStore> = {
  el: useElFilterStore,
  lxt: useLxtFilterStore,
  pl: usePlFilterStore,
  aoi: useAoiFilterStore,
}

export const filterStoreOf = (category: ScanCategory): PlantFilterStore =>
  FILTER_STORES[category]

export type { FilterRestorePlan } from './scanScopePlan'
export {
  activeMachineKeys,
  aliveTypes,
  deriveScope,
  planFilterRestore,
} from './scanScopePlan'

export interface ScanScope {
  category: ScanCategory
  store: PlantFilterStore
  derive: (configured: boolean, typeCatalog: string[]) => ScanParamsResult
  signature: (configured: boolean, typeCatalog: string[]) => string
  /** 回填历史参数并同步归一化；调用方随后推进指纹基线 */
  restore: (item: ScanHistoryItem, settings: AppSettings | null) => void
  /** 按当前入口与类型清单裁掉过期勾选 */
  normalize: (settings: AppSettings | null) => void
}

const createScanScope = (category: ScanCategory): ScanScope => {
  const store = FILTER_STORES[category]

  const normalize = (settings: AppSettings | null): void => {
    const filters = store.getState()
    const alive = aliveTypes(category, settings, filters.types)

    if (alive.length !== filters.types.length) filters.setTypes(alive)

    filters.pruneSelected(activeMachineKeys(category, settings))
  }

  return {
    category,
    store,
    derive: (configured, typeCatalog) =>
      deriveScope(category, store.getState(), configured, typeCatalog),
    signature: (configured, typeCatalog) =>
      deriveScope(category, store.getState(), configured, typeCatalog)
        .filterSignature,
    restore: (item, settings) => {
      const plan = planFilterRestore(category, item)
      const filters = store.getState()

      // 顺序不能反：setPlant 会清空已选机台，setSide 会裁掉另一侧，
      // 必须先把厂区与检测面落定，再回填机台。
      if (plan.plant) filters.setPlant(plan.plant)
      if (plan.imageKind) filters.setImageKind(plan.imageKind)
      if (plan.side) filters.setSide(plan.side)

      filters.setSelectedMachines(plan.machines)
      filters.setDate(plan.date)
      filters.setShift(plan.shift)
      filters.setSlots(plan.slots)
      filters.setTypes(plan.types)

      if (plan.levels) filters.setLevels(plan.levels)

      normalize(settings)
    },
    normalize,
  }
}

const scopes: Partial<Record<ScanCategory, ScanScope>> = {}

export const scanScopeOf = (category: ScanCategory): ScanScope =>
  (scopes[category] ??= createScanScope(category))
