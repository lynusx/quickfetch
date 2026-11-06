import { useEffect, useRef } from 'react'

import type { ScanCategory } from '@shared/ipc'
import { isFinalScanStatus } from '@shared/ipc'
import { scanStoreOf } from '../stores/scanStore'

/**
 * 扫描范围变了就把上一次的结果收起来。
 *
 * 现场的困惑很具体：扫完 46 台、切到另一个日期，右边面板还挂着上一轮的
 * 「已完成 / 命中 0 张」，容易被当成这次的结论。范围变了旧结果就失效了。
 *
 * 两条约束：
 * - 只清已结束的任务。运行中清掉会让进度面板凭空消失，用户以为程序崩了。
 * - 历史恢复不能被当成"范围变了"。恢复由 useScanSession 在筛选归一化
 *   之后再落任务，因此这里只负责用户后续改筛选时的清理，不再依赖墙钟窗口。
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

    const current = store.getState().task

    if (current && isFinalScanStatus(current.status)) {
      store.getState().setTask(null)
      // 错误提示同样属于上一轮，留着会让人以为这次也失败了
      store.getState().setError(null)
    }
  }, [category, signature, store])
}
