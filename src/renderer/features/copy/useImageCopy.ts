import { useCallback, useEffect, useMemo, useRef } from 'react'

import type { CopyTask, ScanCategory } from '@shared/ipc'
import { copyStoreOf } from './copyStore'
import { scanStoreOf } from '@/features/scan'
import { selectPreferences, useSettingsStore } from '@/features/settings'
import { formatFileSize } from '@/utils/common'
import { toErrorMessage } from '@/utils/error'

interface UseImageCopyProps {
  category: ScanCategory
  showToast: (
    title: string,
    message: string,
    type: 'success' | 'error' | 'info',
  ) => void
}

const isFinal = (status: CopyTask['status'] | undefined): boolean =>
  status === 'completed' || status === 'canceled' || status === 'failed'

/**
 * 复制流程的编排。
 *
 * 顺序是刻意固定的：先勾机台与分组 → 预检查给出规模 → 再让用户选目录 → 最后启动。
 * 反过来的话（先选目录再发现只复制 3 张）用户会觉得流程很蠢。
 *
 * 目标目录是硬前置：没选之前「开始复制」保持禁用，不再由 start 内部弹框兜底。
 *
 * 复制源来自对应类别的扫描结果：EL 面板复制 EL 扫到的图，力禧特面板复制
 * 力禧特扫到的图，两边的 scan/copy store 各自独立。
 */
export const useImageCopy = ({ category, showToast }: UseImageCopyProps) => {
  const scanStore = scanStoreOf(category)
  const copyStore = copyStoreOf(category)

  const task = scanStore((state) => state.task)
  const copying = copyStore((state) => state.task)
  const machines = copyStore((state) => state.machines)
  // 分组方式与重名策略来自设置页，主进程与本进程读的是同一份持久化配置
  const preferences = useSettingsStore(selectPreferences)
  const layout = preferences.copyLayout
  const conflict = preferences.copyConflict
  const targetDir = copyStore((state) => state.targetDir)
  const targetName = copyStore((state) => state.targetName)
  const preview = copyStore((state) => state.preview)
  const previewing = copyStore((state) => state.previewing)
  const busy = copyStore((state) => state.busy)
  const error = copyStore((state) => state.error)

  const setTask = copyStore((state) => state.setTask)
  const patchTask = copyStore((state) => state.patchTask)
  const syncMachines = copyStore((state) => state.syncMachines)
  const setPreview = copyStore((state) => state.setPreview)
  const setPreviewing = copyStore((state) => state.setPreviewing)
  const setBusy = copyStore((state) => state.setBusy)
  const setError = copyStore((state) => state.setError)
  const setTarget = copyStore((state) => state.setTarget)

  /**
   * 已经弹过终态提示的「任务 id + 终态 + 完成时间」。
   *
   * 只判 isFinal 不够：重试或重新复制会再发一次终态快照，
   * 同一批次会弹两遍「复制完成」。带上 finishedAt 就能区分是不是新一轮结束。
   */
  const toasted = useRef(new Set<string>())

  // 订阅主进程推送：复制进度、状态变化全靠它，暂停/取消后的收尾也走这里
  useEffect(() => {
    return window.electronAPI.onCopyTaskUpdate((next) => {
      patchTask(next)

      // 只在「刚结束」这一帧提示一次，后续重复推送不再打扰
      if (!isFinal(next.status)) return
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
      // 跳过项算完成，但结果里要单独说清，不然「已复制 0 张」像是没干活
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
  }, [patchTask, setError, showToast])

  /** 机台列表：优先用当前任务各机台的实际图片数，没有则回落到参数里的机台 */
  const machineStats = useMemo(() => {
    if (!task) return []

    const counts = new Map<string, number>()

    for (const branch of task.branches) {
      counts.set(branch.machine, branch.images)
    }

    // 只列出真正有图片的机台：勾选一个 0 张的机台没意义，
    // 而且会让「会复制多少张」的预检查数字对不上
    return [...counts.entries()]
      .filter(([, images]) => images > 0)
      .map(([machine, images]) => ({ machine, images }))
      .sort((a, b) =>
        a.machine.localeCompare(b.machine, 'zh-CN', { numeric: true }),
      )
  }, [task])

  /**
   * 新扫描任务默认全选全部机台。
   *
   * 同步状态放在 store 里而不是 hook ref：切换页面再回来时勾选仍然有效。
   * 用户手动改过勾选后（selectionTouched），同一任务内不再被覆盖。
   */
  useEffect(() => {
    if (!task) return

    syncMachines(
      task.id,
      machineStats.map((item) => item.machine),
    )
  }, [task, machineStats, syncMachines])

  const pickedStats = machineStats.filter((item) =>
    machines.includes(item.machine),
  )
  const pickedCount = pickedStats.reduce((sum, item) => sum + item.images, 0)

  /** 预检查：勾选变化后重算一次，让界面实时显示「将复制 N 张、建 M 个目录」 */
  const refreshPreview = useCallback(async () => {
    // 一台都没选时不请求预检查：否则主进程会按空列表返回 0 张，
    // 界面上「将复制 0 张」像是任务本身没图。
    if (!task || !machineStats.length || !machines.length) {
      setPreview(null)
      return
    }

    setPreviewing(true)

    try {
      const result = await window.electronAPI.previewCopyPlan(
        task.id,
        { machines, layout, conflict },
        targetDir || undefined,
      )

      setPreview(result)
    } catch (cause) {
      setPreview(null)
      setError(toErrorMessage(cause, '无法计算复制计划'))
    } finally {
      setPreviewing(false)
    }
  }, [
    task,
    machineStats.length,
    machines,
    layout,
    // 冲突数要靠目标目录和策略才能算出来，漏在依赖外会导致
    // 选完目录后预检查仍显示「没有冲突」
    conflict,
    targetDir,
    setPreview,
    setPreviewing,
    setError,
  ])

  useEffect(() => {
    void refreshPreview()
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

  /**
   * 开始复制。
   *
   * 目标目录必须已经选好 —— 界面上的按钮在这之前是禁用的，这里再拦一道
   * 并给出明确提示，避免有人从别的入口（比如覆盖确认弹窗）绕过。
   */
  const handleStart = useCallback(async () => {
    if (!task) {
      showToast('没有可复制的图片', '请先完成一次扫描', 'info')
      return
    }
    if (!pickedCount) {
      showToast('没有勾选机台', '请至少勾选 1 台机台', 'info')
      return
    }

    const dir = targetDir || copying?.progress.targetDir

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
    pickedCount,
    targetDir,
    copying,
    machines,
    layout,
    conflict,
    setBusy,
    setError,
    setTask,
    showToast,
  ])

  /** 暂停 / 恢复 / 取消 / 重试 都是同一个形状，抽出来省重复 */
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
    // 优先打开界面上显示的那个目录：复制完成后换了新目录，
    // 「打开」应该指向新选的路径，而不是上一次任务写过的旧路径。
    const dir = targetDir || copying?.progress.targetDir

    if (!dir) return

    const failure = await window.electronAPI.revealCopyTarget(dir)

    if (failure) showToast('打开目录失败', failure, 'error')
  }, [copying, targetDir, showToast])

  /**
   * 当前生效的目标目录：优先取这次选的目录，没有才回落到上一次任务的落盘目录。
   * 复制完成后 targetDir 仍保留，所以「重新复制」不必再选一次；
   * 换了新目录时也以新目录为准，而不是继续显示旧任务写过的路径。
   */
  const activeTargetDir = targetDir || copying?.progress.targetDir

  /**
   * 扫描没结束、没有图片、没勾机台、没选目标目录时都不能复制。
   *
   * 目标目录是硬前置：以前这里漏了它，按钮在未选目录时照样可点，
   * 点下去才弹选择框 —— 用户会以为是「点开始复制就会自己问」，
   * 实际上先把目录选好再去点，意图更清楚。
   */
  const canCopy =
    Boolean(task) &&
    (task?.status === 'completed' || task?.status === 'canceled') &&
    (task?.totalImages ?? 0) > 0 &&
    pickedCount > 0 &&
    Boolean(activeTargetDir) &&
    !busy

  return {
    task: copying,
    machineStats,
    preview,
    previewing,
    targetDir,
    targetName,
    busy,
    error,
    canCopy,
    handleStart,
    handlePause,
    handleResume,
    handleCancel,
    handleRetry,
    handleReveal,
    handlePickTarget,
  }
}
