import { useEffect, useRef } from 'react'

import type { ScanCategory, ScanTaskStatus } from '@shared/ipc'
import { scanStoreOf } from '../stores/scanStore'

/** 已结束的任务状态；只有这些状态下才允许被筛选变更清掉 */
const FINAL_STATUS: ScanTaskStatus[] = [
  'completed',
  'canceled',
  'failed',
  'interrupted',
]

/**
 * 扫描范围变了就把上一次的结果收起来。
 *
 * 现场的困惑很具体：扫完 46 台、切到另一个日期，右边面板还挂着上一轮的
 * 「已完成 / 命中 0 张」，容易被当成这次的结论。范围变了旧结果就失效了。
 *
 * 两条约束：
 * - 只清已结束的任务。运行中清掉会让进度面板凭空消失，用户以为程序崩了。
 * - 首次渲染只记录签名、不触发。否则从历史里恢复结果再进页面，
 *   一切换就没了 —— 恢复出来的结果本身就是"上一次的"，该留着。
 *
 * signature 由调用方拼：日期、班次、时段、类型、厂区、机台任何一项变化都算。
 */
export const useResetOnParamChange = (
  category: ScanCategory,
  signature: string,
): void => {
  const previous = useRef<string | null>(null)

  useEffect(() => {
    if (previous.current === null) {
      previous.current = signature
      return
    }

    if (previous.current === signature) return

    previous.current = signature

    const store = scanStoreOf(category)
    const current = store.getState().task

    if (current && FINAL_STATUS.includes(current.status)) {
      store.getState().setTask(null)
      // 错误提示同样属于上一轮，留着会让人以为这次也失败了
      store.getState().setError(null)
    }
  }, [category, signature])
}
