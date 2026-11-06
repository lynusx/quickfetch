import { useCallback } from 'react'

import { useToast } from '@/hooks/useToast'
import { useElFilterStore } from '../stores/elFilterStore'
import { useAoiFilterStore } from '../stores/aoiFilterStore'
import { useLxtFilterStore } from '../stores/lxtFilterStore'
import { usePlFilterStore } from '../stores/plFilterStore'
import type { PlantFilterStore } from '../stores/plantFilterStore'
import { copyStoreOf } from '@/features/copy'
import {
  selectAoi,
  selectLxt,
  selectPl,
  useSettingsStore,
  useUserPreferencesStore,
} from '@/features/settings'
import { scanStoreOf } from '../stores/scanStore'
import {
  aoiSideOfMachines,
  DEFAULT_AOI_IMAGE_KIND,
  elPlantOf,
} from '@shared/ipc'
import type { ScanCategory, ScanHistoryItem } from '@shared/ipc'
import { SCAN_CATEGORY_META } from '@shared/scanCategories'
import { toErrorMessage } from '@/utils/error'

/**
 * 非 EL 类别各自的筛选 store。
 *
 * 用显式映射而不是「不是利珀就用力禧特」的回落：新增类别时漏写会直接报错，
 * 不会把参数静默写进另一个类别的 store。
 */
const plantFilterStores: Record<
  Exclude<ScanCategory, 'el'>,
  PlantFilterStore
> = {
  lxt: useLxtFilterStore,
  pl: usePlFilterStore,
  aoi: useAoiFilterStore,
}

/**
 * 把历史参数回填到对应页面的筛选面板。
 *
 * 必须回填：否则界面显示「今天 / 白班」，结果却是上周那次的，
 * 用户点「开始扫描」时很容易按错误参数重跑。
 */
const fillFilters = (category: ScanCategory, item: ScanHistoryItem): void => {
  const { machines: picked, date, shift, slots, types, levels } = item.params

  if (category === 'el') {
    const filters = useElFilterStore.getState()

    // 厂区跟着历史里的第一台机台走：否则机台已选中却不在当前厂区的列表里，
    // 用户只看到「机台 3/10」却找不到高亮的那几个。
    // 旧记录可能混着东西区，setPlant 会清空选择，setSelectedMachines 再按
    // 首字母规则把另一区剔掉 —— 同一次扫描不允许跨区。
    const plant = picked.length ? elPlantOf(picked[0]) : null

    if (plant) filters.setPlant(plant)

    filters.setSelectedMachines(picked)
    filters.setDate(date)
    filters.setShift(shift)
    filters.setSlots(slots)
    filters.setTypes(types)
    return
  }

  const filters = plantFilterStores[category].getState()

  // 复合键「厂区/机台」的第一段就是厂区。
  // 顺序不能反：setPlant 会清空已选机台，先选后切会把选中全冲掉。
  const plant = picked[0]?.split('/')[0] ?? ''

  if (plant) filters.setPlant(plant)

  // 森标 AOI 多两个条件：图片类型决定重扫时读哪个目录，检测面从机台键推断。
  // 顺序不能反：setPlant 清空选中，setSide 会裁掉另一侧，最后再回填机台。
  // 推断成「全部」时不会裁掉任何机台，恢复结果与历史一致。
  if (category === 'aoi') {
    filters.setImageKind(item.params.aoiImageKind ?? DEFAULT_AOI_IMAGE_KIND)
    filters.setSide(aoiSideOfMachines(picked))
  }

  filters.setSelectedMachines(picked)
  filters.setDate(date)
  filters.setShift(shift)
  // 森标 AOI 没有时段层，历史里即使残留了值也不带回去
  filters.setSlots(category === 'aoi' ? [] : slots)
  filters.setTypes(types)

  // 等级只有利珀有；力禧特的路径里没有这一层，传了也没意义
  if (category === 'pl' && levels?.length) filters.setLevels(levels)
}

/** 当前类别仍在入口里的机台；EL 是机台名，其余是「厂区/机台」复合键 */
const activeMachines = (category: ScanCategory): string[] => {
  const state = useSettingsStore.getState()

  if (category === 'el') {
    return (state.settings?.machines ?? []).map((item) => item.name)
  }

  const entry =
    category === 'lxt'
      ? selectLxt(state)
      : category === 'pl'
        ? selectPl(state)
        : selectAoi(state)

  return entry.machines.filter((item) => !item.stale).map((item) => item.key)
}

/**
 * 把回填后的筛选条件收敛到「当前仍存在的类型与机台」。
 *
 * 以前这一步靠渲染后的 effect（筛选面板与机台选择器各自 prune），
 * 再等一个 setTimeout 让 effect 先跑。现在在恢复流程里同步做完，
 * 落任务时签名已经稳定，不需要时钟对齐。
 */
const normalizeFilters = (category: ScanCategory): void => {
  const meta = SCAN_CATEGORY_META[category]
  const catalog = useUserPreferencesStore.getState()[meta.typeCatalogKey]
  const store =
    category === 'el' ? useElFilterStore : plantFilterStores[category]
  const filters = store.getState()

  const alive = filters.types.filter((type) => catalog.includes(type))
  if (alive.length !== filters.types.length) filters.setTypes(alive)

  filters.pruneSelected(activeMachines(category))
}

export interface HistoryRestoreOptions {
  /**
   * 筛选已归一化、任务快照即将落盘时调用。
   *
   * session 在这里把指纹基线推进到新范围，避免恢复被当成「用户改了范围」。
   */
  onRestored: () => void
}

/**
 * 载入一条历史记录：还原参数、清掉上一轮的复制状态、替换当前任务快照。
 *
 * 各类扫描共用同一套动作，差别只在参数往哪个 store 回填。
 * 重启后当前任务快照是空的，历史就是唯一的入口，所以这个动作
 * 必须在每个扫描页都可用。
 */
export const useHistoryRestore = (
  category: ScanCategory,
  options: HistoryRestoreOptions,
) => {
  const { showToast } = useToast()
  const { onRestored } = options

  return useCallback(
    async (item: ScanHistoryItem) => {
      try {
        const loaded = await window.electronAPI.loadScanHistory(item.id)

        if (!loaded) {
          showToast(
            '记录已失效',
            '该历史记录的结果文件已不存在，请重新扫描',
            'error',
          )
          return
        }

        fillFilters(category, item)
        normalizeFilters(category)

        // 指纹基线推进到恢复后的范围；这一步必须仍在同步块里，
        // 否则 React 可能先跑一次 effect，把恢复当成用户改范围
        onRestored()

        // 上一轮的复制进度属于另一次结果，留着会让「复制」按钮状态错乱
        copyStoreOf(category).getState().reset()

        // 筛选已同步归一化，直接落任务；不再等 setTimeout
        scanStoreOf(category).getState().setTask(loaded)

        showToast(
          '已载入历史记录',
          `${item.totalImages} 张图片，可直接查看或复制`,
          'info',
        )
      } catch (cause) {
        showToast(
          '载入失败',
          toErrorMessage(cause, '载入历史记录失败'),
          'error',
        )
      }
    },
    [category, showToast, onRestored],
  )
}
