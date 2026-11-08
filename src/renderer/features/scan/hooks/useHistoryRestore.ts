import { useCallback } from 'react'

import { useToast } from '@/hooks/useToast'
import { copyStoreOf } from '@/features/copy'
import { useSettingsStore } from '@/features/settings'
import { scanScopeOf } from '../scanScope'
import { scanStoreOf } from '../stores/scanStore'
import type { ScanCategory, ScanHistoryItem } from '@shared/ipc'
import { canCopyScanStatus } from '@shared/ipc'
import { toErrorMessage } from '@/utils/error'

/**
 * 把历史参数回填到对应页面的筛选面板。
 *
 * 必须回填：否则界面显示「今天 / 白班」，结果却是上周那次的，
 * 用户点「开始扫描」时很容易按错误参数重跑。
 */
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
 * 「参数往哪个 store 回填、按什么顺序、恢复后怎么归一化」都在
 * scanScope；这个 hook 只负责读记录、更新快照与提示。
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

        scanScopeOf(category).restore(
          item,
          useSettingsStore.getState().settings,
        )

        // 指纹基线推进到恢复后的范围；这一步必须仍在同步块里，
        // 否则 React 可能先跑一次 effect，把恢复当成用户改范围
        onRestored()

        // 上一轮的复制进度属于另一次结果，留着会让「复制」按钮状态错乱
        copyStoreOf(category).getState().reset()

        // 筛选已同步归一化，直接落任务；不再等 setTimeout
        scanStoreOf(category).getState().setTask(loaded)

        showToast(
          '已载入历史记录',
          `${item.totalImages} 张图片，${
            canCopyScanStatus(item.status)
              ? '可直接查看或复制'
              : '可查看历史结果'
          }`,
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
