import { useCallback, useEffect, useRef } from 'react'

import type { ScanCategory, ScanTaskParams } from '@shared/ipc'

import { scanStoreOf } from '../stores/scanStore'
import { decideSignatureChange } from '../sessionTransitions'
import { useHistoryRestore } from './useHistoryRestore'
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
  /** 按 store 的当前状态重算指纹；历史恢复后用它推进基线 */
  getSignature: () => string
}

/**
 * 一个 category 的扫描会话。
 *
 * 页面只需要这一个入口：它把「范围变化 → 清上一轮」「历史恢复 → 回填参数
 * 并载入任务」「启动 / 暂停 / 继续 / 取消」的调用顺序收在一个 module 里。
 * 具体 store 仍是 implementation detail；页面不再同时 import 三个 hook。
 *
 * 指纹基线归 session 所有：恢复历史时先调 suppressSignature()，再同步回填
 * 筛选并安装快照，下一轮指纹变化不会被误判成「用户改了范围」；不再用
 * setTimeout 让 effect 先跑。判定本身是纯函数，见 sessionTransitions。
 */
export const useScanSession = ({
  category,
  showToast,
  getParams,
  filterSignature,
  getSignature,
}: UseScanSessionProps) => {
  const store = scanStoreOf(category)
  /** 上一次已接受的扫描范围指纹 */
  const signatureBaseline = useRef<string | null>(null)

  useEffect(() => {
    const current = store.getState().task
    const decision = decideSignatureChange(
      signatureBaseline.current,
      filterSignature,
      current?.status ?? null,
    )

    if (decision === 'ignore') return

    if (decision === 'reset') {
      store.getState().setTask(null)
      // 错误提示同样属于上一轮，留着会让人以为这次也失败了
      store.getState().setError(null)
    }

    signatureBaseline.current = filterSignature
  }, [category, filterSignature, store])

  const scan = useScanTask({ category, showToast, getParams })
  // 恢复流程在同步块里把基线推到恢复后的指纹；
  // 之后任何一次真实的范围变化仍然会清掉上一轮结果
  const restoreHistory = useHistoryRestore(category, {
    onRestored: () => {
      signatureBaseline.current = getSignature()
    },
  })

  const clearResult = useCallback(() => {
    scanStoreOf(category).getState().setTask(null)
  }, [category])

  return {
    ...scan,
    restoreHistory,
    clearResult,
  }
}
