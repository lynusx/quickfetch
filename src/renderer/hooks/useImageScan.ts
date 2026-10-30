import { useCallback } from 'react'

import { useImageFilterStore } from '../stores/imageFilterStore'
import { useImageStore } from '../stores/imageStore'
import { formatDuration } from '../utils/common'
import { toErrorMessage } from '../utils/error'

interface UseImageScanProps {
  showToast: (
    title: string,
    message: string,
    type: 'success' | 'error' | 'info',
  ) => void
}

/**
 * 扫描步骤：选目录 → 主进程遍历 → 进度推送 → 结果落到 store。
 * 与复制步骤完全解耦，复制由 useImageCopy 单独承担。
 */
export const useImageScan = ({ showToast }: UseImageScanProps) => {
  const { plant, date, shift, times, types, setDirs } = useImageFilterStore()
  const {
    isScan,
    isCopy,
    scanTaskId,
    scanProgress,
    setImages,
    setIsScan,
    setIsError,
    setError,
    setCopiedImageCount,
    setScanProgress,
    setScanSummary,
    setScanTaskId,
  } = useImageStore()

  // 扫描源目录：目录校验与 6 层规则遍历全部在主进程完成
  const handleImageScan = useCallback(async () => {
    // 1. 选择 DC 根目录（用户取消则整体不动作）
    const root = await window.electronAPI.pickDirectory({
      title: '请选择 DC 目录',
    })

    if (!root) return

    // 2. 重置上一轮结果
    setImages([])
    setIsError(false)
    setError(null)
    setCopiedImageCount(0)
    setScanSummary(null)

    const taskId = crypto.randomUUID()

    setScanTaskId(taskId)
    setIsScan(true)
    setScanProgress({
      taskId,
      scannedDirs: 0,
      matched: 0,
      currentPath: root.path,
      elapsedMs: 0,
    })
    showToast('扫描开始', '正在扫描文件...', 'info')

    // 3. 订阅进度（只处理本次任务的事件）
    const unsubscribe = window.electronAPI.onScanProgress((progress) => {
      if (progress.taskId === taskId) setScanProgress(progress)
    })

    try {
      const result = await window.electronAPI.scanImages(
        { rootPath: root.path, plant, date, shift, times, types },
        taskId,
      )

      if (result.canceled) {
        showToast(
          '已取消',
          `扫描已取消，已读取 ${result.scannedDirs} 个目录`,
          'info',
        )
        return
      }

      setDirs(result.dirs)
      setImages(result.images)
      setScanSummary({
        scannedDirs: result.scannedDirs,
        elapsedMs: result.elapsedMs,
      })
      showToast(
        '扫描完成',
        `共找到 ${result.images.length} 张图片，读取 ${result.scannedDirs} 个目录，耗时 ${formatDuration(result.elapsedMs)}`,
        'success',
      )
    } catch (error) {
      const message = toErrorMessage(error, '扫描过程中发生未知错误')

      setIsError(true)
      setError(new Error(message))
      showToast('扫描失败', message, 'error')
      console.error('扫描出错:', message)
    } finally {
      unsubscribe()
      setIsScan(false)
      setScanProgress(null)
      setScanTaskId(null)
    }
  }, [
    plant,
    date,
    shift,
    times,
    types,
    setDirs,
    setImages,
    setError,
    setIsError,
    setCopiedImageCount,
    setScanProgress,
    setScanSummary,
    setScanTaskId,
  ])

  // 取消当前扫描：主进程收到 abort 后在下一个目录边界停下
  const handleCancelScan = useCallback(async () => {
    if (!scanTaskId) return
    await window.electronAPI.cancelScan(scanTaskId)
  }, [scanTaskId])

  // 检测是否可以开始扫描
  const canStartScan = () =>
    times.length > 0 && types.length > 0 && !isScan && !isCopy

  return {
    isScan,
    scanTaskId,
    scanProgress,
    canStartScan,
    handleImageScan,
    handleCancelScan,
  }
}
