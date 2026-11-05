import { useCallback } from 'react'

import type { ScanCategory, ScanTaskParams } from '@shared/ipc'

import { scanStoreOf } from '../stores/scanStore'
import { useHistoryRestore } from './useHistoryRestore'
import { useResetOnParamChange } from './useResetOnParamChange'
import { useScanTask } from './useScanTask'

interface UseScanSessionProps {
  category: ScanCategory
  showToast: (
    title: string,
    message: string,
    type: 'success' | 'error' | 'info',
  ) => void
  getParams: () => Omit<ScanTaskParams, 'category'>
  /** 当前筛选范围指纹；变化时收起上一轮结果 */
  filterSignature: string
}

/**
 * 一个 category 的扫描会话。
 *
 * 页面只需要这一个入口：它把「范围变化 → 清上一轮」「历史恢复 → 回填参数
 * 并载入任务」「启动 / 暂停 / 继续 / 取消」的调用顺序收在一个 module 里。
 * 具体 store 仍是 implementation detail；页面不再同时 import 三个 hook。
 */
export const useScanSession = ({
  category,
  showToast,
  getParams,
  filterSignature,
}: UseScanSessionProps) => {
  useResetOnParamChange(category, filterSignature)

  const scan = useScanTask({ category, showToast, getParams })
  const restoreHistory = useHistoryRestore(category)

  const clearResult = useCallback(() => {
    scanStoreOf(category).getState().setTask(null)
  }, [category])

  return {
    ...scan,
    restoreHistory,
    clearResult,
  }
}
