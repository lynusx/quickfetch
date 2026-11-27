import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'

import type { CopyTask, ScanCategory, ScanTask } from '@shared/ipc'
import { isFinalCopyStatus } from '@shared/ipc'
import { scanStoreOf } from '@/features/scan/stores/scanStore'
import { selectPreferences, useSettingsStore } from '@/features/settings'
import { formatFileSize } from '@/utils/common'
import { toErrorMessage } from '@/utils/error'

import { copyTaskMatchesCategory, deriveCopyReadModel } from './copyReadModel'
import { copyStoreOf, hitMachinesOf } from './copyStore'

export interface CopyTableSelection {
  machines: string[]
  selectableMachines: string[]
  allSelectableChecked: boolean
  someSelectableChecked: boolean
  /** 复制运行或暂停期间锁定勾选框，防止中途篡改范围 */
  locked: boolean
  toggleAll: (checked: boolean | 'indeterminate') => void
  toggleMachine: (machine: string, checked: boolean | 'indeterminate') => void
}

/**
 * 供扫描结果表使用的窄订阅勾选接口：
 * 只订阅 `machines` 与复制任务运行锁，预检查计算与复制进度刷新不会重渲染整张结果表。
 */
export const useCopyTableSelection = (
  category: ScanCategory,
  scanTask: Pick<ScanTask, 'branches'>,
): CopyTableSelection => {
  const copyStore = copyStoreOf(category)
  const { machines, locked } = copyStore(
    useShallow((state) => ({
      machines: state.machines,
      locked:
        state.task?.status === 'running' ||
        state.task?.status === 'pending' ||
        state.task?.status === 'paused',
    })),
  )

  const selectableMachines = useMemo(() => hitMachinesOf(scanTask), [scanTask])

  const allSelectableChecked =
    selectableMachines.length > 0 &&
    selectableMachines.every((machine) => machines.includes(machine))
  const someSelectableChecked = selectableMachines.some((machine) =>
    machines.includes(machine),
  )

  const toggleAll = useCallback(
    (checked: boolean | 'indeterminate') => {
      copyStore.getState().toggleAll(selectableMachines, Boolean(checked))
    },
    [copyStore, selectableMachines],
  )

  const toggleMachine = useCallback(
    (machine: string, checked: boolean | 'indeterminate') => {
      copyStore.getState().toggleMachine(machine, Boolean(checked))
    },
    [copyStore],
  )

  return {
    machines,
    selectableMachines,
    allSelectableChecked,
    someSelectableChecked,
    locked,
    toggleAll,
    toggleMachine,
  }
}

interface UseImageCopyProps {
  category: ScanCategory
  showToast: (
    title: string,
    message: string,
    type: 'success' | 'error' | 'info',
  ) => void
}

/**
 * 复制会话编排（仅供吸底复制栏消费）：订阅主进程复制事件、防抖计算预检查、执行开始/暂停/继续/取消/重试。
 */
export const useImageCopy = ({ category, showToast }: UseImageCopyProps) => {
  const scanStore = scanStoreOf(category)
  const copyStore = copyStoreOf(category)

  const task = scanStore((state) => state.task)
  const copying = copyStore((state) => state.task)
  const machines = copyStore((state) => state.machines)
  const preferences = useSettingsStore(selectPreferences)
  const layout = preferences.copyLayout
  const conflict = preferences.copyConflict
  const targetDir = copyStore((state) => state.targetDir)
  const targetName = copyStore((state) => state.targetName)
  const preview = copyStore((state) => state.preview)
  const previewing = copyStore((state) => state.previewing)
  const busy = copyStore((state) => state.busy)
  const error = copyStore((state) => state.error)
  const showFailures = copyStore((state) => state.showFailures)

  const setTask = copyStore((state) => state.setTask)
  const patchTask = copyStore((state) => state.patchTask)
  const setPreview = copyStore((state) => state.setPreview)
  const setPreviewing = copyStore((state) => state.setPreviewing)
  const setBusy = copyStore((state) => state.setBusy)
  const setError = copyStore((state) => state.setError)
  const setTarget = copyStore((state) => state.setTarget)
  const setShowFailures = copyStore((state) => state.setShowFailures)

  const toasted = useRef(new Set<string>())

  useEffect(() => {
    return window.electronAPI.onCopyTaskUpdate((next) => {
      if (!copyTaskMatchesCategory(category, next)) return

      patchTask(next)

      if (!isFinalCopyStatus(next.status)) return
      if (next.status === 'canceled') return

      const key = `${next.id}:${next.status}:${next.progress.finishedAt ?? 0}`
      if (toasted.current.has(key)) return

      toasted.current.add(key)

      if (next.status === 'failed') {
        setError(next.error ?? '复制过程中发生未知错误')
        return
      }

      const renamed = next.progress.renamed
        ? `，${next.progress.renamed} 张重名已改名`
        : ''
      const { copied, failed, alreadyExists, skipped, total, totalBytes } =
        next.progress
      const existsText = alreadyExists ? `，${alreadyExists} 张目标已存在` : ''
      const skippedText = skipped ? `，${skipped} 张源内重名跳过` : ''
      const sizeText =
        totalBytes > 0 ? `，共 ${formatFileSize(totalBytes)}` : ''
      const title = failed
        ? '复制完成但有条目失败'
        : !copied && existsText
          ? '目标目录已存在同名文件'
          : '复制完成'

      showToast(
        title,
        `共 ${total} 张${sizeText}，已复制 ${copied} 张${renamed}${existsText}${skippedText}${
          failed ? `，${failed} 张失败` : ''
        }`,
        failed ? 'error' : 'success',
      )
    })
  }, [category, patchTask, setError, showToast])

  const machineStats = useMemo(() => {
    if (!task) return []

    const counts = new Map<string, number>()
    for (const branch of task.branches) {
      counts.set(branch.machine, branch.images)
    }

    return [...counts.entries()]
      .filter(([, images]) => images > 0)
      .map(([machine, images]) => ({ machine, images }))
      .sort((a, b) =>
        a.machine.localeCompare(b.machine, 'zh-CN', { numeric: true }),
      )
  }, [task])

  const readModel = useMemo(
    () =>
      deriveCopyReadModel({
        task: copying,
        scanTask: task,
        machines,
        machineStats,
        targetDir,
        busy,
      }),
    [copying, task, machines, machineStats, targetDir, busy],
  )

  const previewSeq = useRef(0)

  const refreshPreview = useCallback(async () => {
    const seq = (previewSeq.current += 1)

    if (!task || !machineStats.length || !machines.length) {
      setPreview(null)
      setPreviewing(false)
      return
    }

    setPreviewing(true)

    try {
      const result = await window.electronAPI.previewCopyPlan(
        task.id,
        { machines, layout, conflict },
        targetDir || undefined,
      )

      if (seq !== previewSeq.current) return

      setPreview(result)
    } catch (cause) {
      if (seq !== previewSeq.current) return

      setPreview(null)
      setError(toErrorMessage(cause, '无法计算复制计划'))
    } finally {
      if (seq === previewSeq.current) setPreviewing(false)
    }
  }, [
    task,
    machineStats.length,
    machines,
    layout,
    conflict,
    targetDir,
    setPreview,
    setPreviewing,
    setError,
  ])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshPreview()
    }, 250)

    return () => window.clearTimeout(timer)
  }, [refreshPreview])

  const handlePickTarget = useCallback(async (): Promise<string | null> => {
    const picked = await window.electronAPI.pickDirectory({
      title: '请选择复制目标目录',
    })

    if (!picked) return null

    setTarget(picked.path, picked.name)
    setError(null)

    return picked.path
  }, [setTarget, setError])

  const handleStart = useCallback(async () => {
    if (!task) {
      showToast('没有可复制的图片', '请先完成一次扫描', 'info')
      return
    }
    if (!readModel.pickedCount) {
      showToast('没有勾选机台', '请至少勾选 1 台机台', 'info')
      return
    }

    const dir = readModel.revealDir

    if (!dir) {
      showToast('还没选目标目录', '请先点「选择目录」指定保存位置', 'info')
      return
    }

    setBusy(true)
    setError(null)

    try {
      const created = await window.electronAPI.startCopyTask(task.id, dir, {
        machines,
        layout,
        conflict,
      })

      setTask(created)
    } catch (cause) {
      setError(toErrorMessage(cause, '启动复制失败'))
      showToast('复制失败', toErrorMessage(cause, '启动复制失败'), 'error')
    } finally {
      setBusy(false)
    }
  }, [
    task,
    readModel.pickedCount,
    readModel.revealDir,
    machines,
    layout,
    conflict,
    setBusy,
    setError,
    setTask,
    showToast,
  ])

  const run = useCallback(
    async (
      action: (id: string) => Promise<CopyTask | null>,
      label: string,
    ): Promise<void> => {
      if (!copying) return

      setBusy(true)

      try {
        const next = await action(copying.id)

        if (next) patchTask(next)
      } catch (cause) {
        showToast(
          `${label}失败`,
          toErrorMessage(cause, `${label}失败`),
          'error',
        )
      } finally {
        setBusy(false)
      }
    },
    [copying, patchTask, setBusy, showToast],
  )

  const handlePause = useCallback(
    () => run((id) => window.electronAPI.pauseCopyTask(id), '暂停'),
    [run],
  )

  const handleResume = useCallback(
    () => run((id) => window.electronAPI.resumeCopyTask(id), '继续'),
    [run],
  )

  const handleCancel = useCallback(
    () => run((id) => window.electronAPI.cancelCopyTask(id), '取消'),
    [run],
  )

  const handleRetry = useCallback(
    () => run((id) => window.electronAPI.retryCopyFailures(id), '重试'),
    [run],
  )

  const handleReveal = useCallback(async () => {
    const dir = readModel.revealDir

    if (!dir) return

    const failure = await window.electronAPI.revealCopyTarget(dir)

    if (failure) showToast('打开目录失败', failure, 'error')
  }, [readModel.revealDir, showToast])

  return {
    task: copying,
    machineStats,
    preview,
    previewing,
    targetDir,
    targetName,
    busy,
    error,
    layout,
    conflict,
    showFailures,
    setShowFailures,
    readModel,
    canCopy: readModel.canCopy,
    handleStart,
    handlePause,
    handleResume,
    handleCancel,
    handleRetry,
    handleReveal,
    handlePickTarget,
  }
}
