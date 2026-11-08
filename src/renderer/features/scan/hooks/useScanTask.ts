import { useCallback, useEffect, useRef } from 'react'

import type {
  ScanCategory,
  ScanTask,
  ScanTaskParams,
  ScanTaskStatus,
} from '@shared/ipc'
import {
  SCAN_CATEGORY_LABEL,
  SCAN_CATEGORY_META,
  normalizeScanCategory,
} from '@shared/scanCategories'
import { copyStoreOf } from '@/features/copy'
import {
  scanStoreOf,
  useAoiScanStore,
  useElScanStore,
  useLxtScanStore,
  usePlScanStore,
} from '../stores/scanStore'
import { formatDuration } from '@/utils/common'
import { toErrorMessage } from '@/utils/error'

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

/** 运行态下对账间隔：只兜底丢推送，不参与实时进度 */
const STATUS_POLL_MS = 2000

const isBusy = (status: ScanTaskStatus | undefined): boolean =>
  status === 'pending' || status === 'running' || status === 'paused'

/**
 * 扫描任务的生命周期：创建 → 启动 → 暂停/恢复/取消。
 *
 * 进度不通过 invoke 的返回值传递，而是订阅主进程推送的整份任务快照，
 * 这样即使页面切走再回来，状态依然是最新的。
 *
 * 两个类别各有独立的 scanStore：EL 的结果只进 EL 的 store，力禧特的只进
 * 力禧特的 store，切页面不会把上一类的进度/结果带过来。主进程广播的是
 * 所有类别的任务，订阅回调按 category 过滤后再落对应 store。
 *
 * 仍然全局互斥：同一时刻只允许一个类别的任务在跑，另一页按钮置灰并提示。
 * 45 台力禧特可能跑十几分钟，允许并行时两张网的读取会互相拖累。
 */
export const useScanTask = ({
  category,
  showToast,
  getParams,
}: UseScanTaskProps) => {
  const store = scanStoreOf(category)

  const { task, creating, error, setTask, setCreating, setError } = store()

  const toastRef = useRef(showToast)
  const paramsRef = useRef(getParams)

  // 在 effect 里刷新，而不是渲染期直接赋值：渲染期写 ref 会被
  // react-hooks/refs 判定为副作用，且并发渲染下可能写到被丢弃的那次渲染上
  useEffect(() => {
    toastRef.current = showToast
    paramsRef.current = getParams
  })

  useEffect(() => {
    // 页面切走再回来时，用当前状态作为基线，避免重复弹出「扫描完成」
    let previousStatus: ScanTaskStatus | null =
      store.getState().task?.status ?? null

    const apply = (next: ScanTask): void => {
      // 广播里混着两个类别的任务，只处理本类别的
      if (normalizeScanCategory(next.params.category) !== category) return

      const current = store.getState().task

      // 切换任务后旧任务的推送可能还在路上，按 id 过滤
      if (current && current.id !== next.id) return

      store.getState().setTask(next)

      if (next.status !== previousStatus) {
        if (next.status === 'completed') {
          if (next.totalImages > 0) {
            toastRef.current(
              '扫描完成',
              `共 ${next.totalImages} 张图片，耗时 ${formatDuration(next.elapsedMs)}`,
              'success',
            )
          } else {
            toastRef.current(
              '扫描完成，未命中图片',
              '已完成探测，但没有找到图片；请查看各机台结果里的断链原因。',
              'info',
            )
          }
        } else if (next.status === 'failed' && next.error) {
          toastRef.current('扫描失败', next.error, 'error')
        } else if (next.status === 'paused' && next.pauseReason === 'network') {
          toastRef.current(
            '网络不通',
            SCAN_CATEGORY_META[category].networkHint,
            'error',
          )
        }
      }

      previousStatus = next.status
    }

    const unsubscribe = window.electronAPI.onScanTaskUpdate(apply)

    /*
     * 兜底拉一次：主进程的进度推送会按固定间隔节流，取消、暂停这类
     * "状态变了但进度没变"的更新有可能贴着节流窗口被并掉；IPC 偶尔
     * 丢一条，界面就会一直停在旧状态（现场看到的"卡住"）。
     * 这里只做低频对账，不承担实时进度，开销可以忽略。
     *
     * 只在任务处于运行态时轮询：终态已经不会再变，继续拉纯属浪费。
     */
    const poll = window.setInterval(() => {
      const current = store.getState().task

      if (!current || !isBusy(current.status)) return

      void window.electronAPI
        .getScanTask(current.id)
        .then((latest) => {
          if (latest) apply(latest)
        })
        .catch(() => undefined)
    }, STATUS_POLL_MS)

    return () => {
      unsubscribe()
      window.clearInterval(poll)
    }
  }, [category, store])

  // 重新进入页面时补一次同步，避免错过订阅空窗期的状态变更
  useEffect(() => {
    const current = store.getState().task
    if (!current) return

    void window.electronAPI
      .getScanTask(current.id)
      .then((latest) => {
        if (
          latest &&
          normalizeScanCategory(latest.params.category) === category
        ) {
          store.getState().setTask(latest)
        }
      })
      .catch(() => undefined)
  }, [category, store])

  const start = useCallback(async () => {
    setError(null)
    setCreating(true)
    // 新一轮扫描开始前清掉本类别上一轮的复制任务，否则进度条还挂着旧目录的数据
    copyStoreOf(category).getState().reset()

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
  const elTask = useElScanStore((state) => state.task)
  const lxtTask = useLxtScanStore((state) => state.task)
  const plTask = usePlScanStore((state) => state.task)
  const aoiTask = useAoiScanStore((state) => state.task)

  const other = [
    { category: 'el' as ScanCategory, task: elTask },
    { category: 'lxt' as ScanCategory, task: lxtTask },
    { category: 'pl' as ScanCategory, task: plTask },
    { category: 'aoi' as ScanCategory, task: aoiTask },
  ].find(
    (item) =>
      item.category !== category && item.task && isBusy(item.task.status),
  )?.task

  const otherTask: ScanTask | null = other ?? null

  const otherLabel = otherTask
    ? `正在扫描 ${
        SCAN_CATEGORY_LABEL[normalizeScanCategory(otherTask.params.category)]
      }（${
        otherTask.branches.filter((branch) => branch.status !== 'skipped')
          .length
      }/${otherTask.branches.length} 台），完成后再开始`
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
