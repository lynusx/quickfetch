import { useCallback, useEffect, useRef } from 'react'

import type {
  ScanCategory,
  ScanTask,
  ScanTaskParams,
  ScanTaskStatus,
} from '../../shared/ipc'
import { SCAN_CATEGORY_LABEL } from '../../shared/ipc'
import { useCopyStore } from '../stores/copyStore'
import { useScanStore } from '../stores/scanStore'
import { formatDuration } from '../utils/common'
import { toErrorMessage } from '../utils/error'

interface UseScanTaskProps {
  category: ScanCategory
  showToast: (
    title: string,
    message: string,
    type: 'success' | 'error' | 'info',
  ) => void
  /** 由页面自己从各自的筛选 store 里取，两类扫描的参数来源不同 */
  getParams: () => Omit<ScanTaskParams, 'category'>
}

const isBusy = (status: ScanTaskStatus | undefined): boolean =>
  status === 'pending' || status === 'running' || status === 'paused'

/**
 * 扫描任务的生命周期：创建 → 启动 → 暂停/恢复/取消。
 *
 * 进度不通过 invoke 的返回值传递，而是订阅主进程推送的整份任务快照，
 * 这样即使页面切走再回来，状态依然是最新的。
 *
 * 两类扫描共用一个 store，全局只允许一个任务在跑 —— 45 台力禧特可能跑
 * 十几分钟，允许并行时两张网的读取会互相拖累，且现场基本只在一个网络下作业。
 */
export const useScanTask = ({
  category,
  showToast,
  getParams,
}: UseScanTaskProps) => {
  const { task, creating, error, setTask, setCreating, setError } =
    useScanStore()

  const toastRef = useRef(showToast)
  toastRef.current = showToast

  const paramsRef = useRef(getParams)
  paramsRef.current = getParams

  useEffect(() => {
    // 页面切走再回来时，用当前状态作为基线，避免重复弹出「扫描完成」
    let previousStatus: ScanTaskStatus | null =
      useScanStore.getState().task?.status ?? null

    const unsubscribe = window.electronAPI.onScanTaskUpdate((next) => {
      const current = useScanStore.getState().task

      // 切换任务后旧任务的推送可能还在路上，按 id 过滤
      if (current && current.id !== next.id) return

      useScanStore.getState().setTask(next)

      if (next.status !== previousStatus) {
        if (next.status === 'completed') {
          toastRef.current(
            '扫描完成',
            `共 ${next.totalImages} 张图片，耗时 ${formatDuration(next.elapsedMs)}`,
            'success',
          )
        } else if (next.status === 'failed' && next.error) {
          toastRef.current('扫描失败', next.error, 'error')
        } else if (next.status === 'paused' && next.pauseReason === 'network') {
          toastRef.current(
            '网络不通',
            category === 'lxt'
              ? '连不上机台，请确认已接入力禧特专用内网后点击继续'
              : '共享盘连接中断，任务已暂停，恢复连接后点击继续',
            'error',
          )
        }
      }

      previousStatus = next.status
    })

    return unsubscribe
  }, [category])

  // 重新进入页面时补一次同步，避免错过订阅空窗期的状态变更
  useEffect(() => {
    const current = useScanStore.getState().task
    if (!current) return

    void window.electronAPI
      .getScanTask(current.id)
      .then((latest) => {
        if (latest) useScanStore.getState().setTask(latest)
      })
      .catch(() => undefined)
  }, [])

  const start = useCallback(async () => {
    setError(null)
    setCreating(true)
    // 新一轮扫描开始前清掉上一轮的复制任务，否则进度条还挂着旧目录的数据
    useCopyStore.getState().reset()

    try {
      const created = await window.electronAPI.createScanTask({
        ...paramsRef.current(),
        category,
      })

      // 创建瞬间就落到 store，进度条立即从 0% 开始，不等第一个进度事件
      setTask(created)

      const running = await window.electronAPI.startScanTask(created.id)
      setTask(running)
    } catch (cause) {
      const message = toErrorMessage(cause, '创建扫描任务失败')

      setError(message)
      showToast('扫描失败', message, 'error')
    } finally {
      setCreating(false)
    }
  }, [category, setTask, setCreating, setError, showToast])

  const pause = useCallback(async () => {
    if (!task) return
    setTask(await window.electronAPI.pauseScanTask(task.id))
  }, [task, setTask])

  const resume = useCallback(async () => {
    if (!task) return
    setTask(await window.electronAPI.resumeScanTask(task.id))
  }, [task, setTask])

  const cancel = useCallback(async () => {
    if (!task) return
    setTask(await window.electronAPI.cancelScanTask(task.id))
  }, [task, setTask])

  const busy = isBusy(task?.status)

  /**
   * 别的类别正在扫。全局互斥：另一页的按钮要置灰并说明在扫什么，
   * 而不是允许点下去再报错。
   */
  const other: ScanTask | null =
    task && busy && (task.params.category ?? 'el') !== category ? task : null

  const otherLabel = other
    ? `正在扫描 ${SCAN_CATEGORY_LABEL[other.params.category ?? 'el']}（${
        other.branches.filter((branch) => branch.status !== 'skipped').length
      }/${other.branches.length} 台），完成后再开始`
    : null

  return {
    task,
    creating,
    error,
    busy,
    other,
    otherLabel,
    start,
    pause,
    resume,
    cancel,
  }
}
