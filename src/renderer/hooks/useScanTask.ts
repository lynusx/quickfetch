import { useCallback, useEffect, useRef } from 'react'

import type { ScanTaskStatus } from '../../shared/ipc'
import { useCopyStore } from '../stores/copyStore'
import { useImageFilterStore } from '../stores/imageFilterStore'
import { useScanStore } from '../stores/scanStore'
import { formatDuration } from '../utils/common'
import { toErrorMessage } from '../utils/error'

interface UseScanTaskProps {
  showToast: (
    title: string,
    message: string,
    type: 'success' | 'error' | 'info',
  ) => void
}

const isBusy = (status: ScanTaskStatus | undefined): boolean =>
  status === 'pending' || status === 'running' || status === 'paused'

/**
 * 扫描任务的生命周期：创建 → 启动 → 暂停/恢复/取消。
 *
 * 进度不通过 invoke 的返回值传递，而是订阅主进程推送的整份任务快照，
 * 这样即使页面切走再回来，状态依然是最新的。
 */
export const useScanTask = ({ showToast }: UseScanTaskProps) => {
  const { task, creating, error, setTask, setCreating, setError } =
    useScanStore()
  const { selectedMachines, date, shift, slots, types } = useImageFilterStore()

  const toastRef = useRef(showToast)
  toastRef.current = showToast

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
            '网络中断',
            '共享盘连接中断，任务已暂停，恢复连接后点击继续',
            'error',
          )
        }
      }

      previousStatus = next.status
    })

    return unsubscribe
  }, [])

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
        machines: selectedMachines,
        date,
        shift,
        slots,
        types,
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
  }, [
    selectedMachines,
    date,
    shift,
    slots,
    types,
    setTask,
    setCreating,
    setError,
    showToast,
  ])

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

  const canStart =
    !busy &&
    !creating &&
    selectedMachines.length > 0 &&
    slots.length > 0 &&
    types.length > 0 &&
    Boolean(date)

  return {
    task,
    creating,
    error,
    busy,
    canStart,
    start,
    pause,
    resume,
    cancel,
  }
}
