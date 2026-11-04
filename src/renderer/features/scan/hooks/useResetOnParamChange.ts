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
 * - 历史恢复不能被当成"范围变了"。恢复会先改筛选再载入任务，筛选面板
 *   还可能把历史里不在当前类型清单中的类型剪掉，造成第二次签名变化。
 *   恢复后 1 秒内不做清理，等参数归一化完；之后手动改筛选仍会清空。
 *
 * signature 由调用方拼：日期、班次、时段、类型、厂区、机台任何一项变化都算。
 */
export const useResetOnParamChange = (
  category: ScanCategory,
  signature: string,
): void => {
  const store = scanStoreOf(category)
  const previous = useRef<string | null>(null)

  useEffect(() => {
    if (previous.current === null) {
      previous.current = signature
      return
    }

    if (previous.current === signature) return

    previous.current = signature

    // 恢复后的短暂窗口：签名变化来自参数回填/归一化，不是用户改范围
    if (Date.now() < store.getState().restoreUntil) return

    const current = store.getState().task

    if (current && FINAL_STATUS.includes(current.status)) {
      store.getState().setTask(null)
      // 错误提示同样属于上一轮，留着会让人以为这次也失败了
      store.getState().setError(null)
    }
  }, [category, signature, store])
}
