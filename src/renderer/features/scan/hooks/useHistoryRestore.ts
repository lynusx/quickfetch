import { useCallback } from 'react'

import { useToast } from '@/hooks/useToast'
import { useImageFilterStore } from '../stores/imageFilterStore'
import { useLxtFilterStore } from '../stores/lxtFilterStore'
import { usePlFilterStore } from '../stores/plFilterStore'
import { copyStoreOf } from '@/features/copy'
import { scanStoreOf } from '../stores/scanStore'
import { useSettingsStore } from '@/features/settings'
import type { Plant, ScanCategory, ScanHistoryItem } from '@shared/ipc'
import { toErrorMessage } from '@/utils/error'

/**
 * 把历史参数回填到对应页面的筛选面板。
 *
 * 必须回填：否则界面显示「今天 / 白班」，结果却是上周那次的，
 * 用户点「开始扫描」时很容易按错误参数重跑。
 */
const fillFilters = (category: ScanCategory, item: ScanHistoryItem): void => {
  const { machines: picked, date, shift, slots, types, levels } = item.params

  if (category === 'el') {
    const filters = useImageFilterStore.getState()
    const settings = useSettingsStore.getState().settings

    // 厂区跟着历史里的机台走：否则机台已选中却不在当前厂区的列表里，
    // 用户只看到「机台 3/10」却找不到高亮的那几个
    const plants = new Set(
      picked
        .map(
          (name) =>
            settings?.machines.find((machine) => machine.name === name)?.plant,
        )
        .filter(Boolean),
    )

    if (plants.size === 1) filters.setPlant([...plants][0] as Plant)

    filters.setSelectedMachines(picked)
    filters.setDate(date)
    filters.setShift(shift)
    filters.setSlots(slots)
    filters.setTypes(types)
    return
  }

  const filters = (
    category === 'pl' ? usePlFilterStore : useLxtFilterStore
  ).getState()

  // 复合键「厂区/机台」的第一段就是厂区。
  // 顺序不能反：setPlant 会清空已选机台，先选后切会把选中全冲掉。
  const plant = picked[0]?.split('/')[0] ?? ''

  if (plant) filters.setPlant(plant)

  filters.setSelectedMachines(picked)
  filters.setDate(date)
  filters.setShift(shift)
  filters.setSlots(slots)
  filters.setTypes(types)

  // 等级只有利珀有；力禧特的路径里没有这一层，传了也没意义
  if (category === 'pl' && levels?.length) filters.setLevels(levels)
}

/**
 * 载入一条历史记录：还原参数、清掉上一轮的复制状态、替换当前任务快照。
 *
 * 三类扫描共用同一套动作，差别只在参数往哪个 store 回填。
 * 重启后当前任务快照是空的，历史就是唯一的入口，所以这个动作
 * 必须在每个扫描页都可用。
 */
export const useHistoryRestore = (category: ScanCategory) => {
  const { showToast } = useToast()

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

        // 上一轮的复制进度属于另一次结果，留着会让「复制」按钮状态错乱
        copyStoreOf(category).getState().reset()
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
    [category, showToast],
  )
}
