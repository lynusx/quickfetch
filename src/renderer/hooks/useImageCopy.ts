import { useCallback } from 'react'

import { useScanStore } from '../stores/scanStore'
import { toErrorMessage } from '../utils/error'

interface UseImageCopyProps {
  showToast: (
    title: string,
    message: string,
    type: 'success' | 'error' | 'info',
  ) => void
}

/**
 * 复制步骤：按 taskId 让主进程复制全量结果。
 * 渲染层不持有图片数组，避免上万条路径在 IPC 上来回搬。
 */
export const useImageCopy = ({ showToast }: UseImageCopyProps) => {
  const { task, copy } = useScanStore()

  const handleCopy = useCallback(async () => {
    if (!task || task.totalImages === 0) {
      showToast('没有可复制的图片', '请先完成一次扫描', 'info')
      return
    }

    const target = await window.electronAPI.pickDirectory({
      title: '请选择目标目录',
    })

    if (!target) return

    useScanStore.getState().setCopy({
      running: true,
      copied: 0,
      total: task.totalImages,
      failed: 0,
      batchIndex: 0,
      batchTotal: 0,
    })

    const unsubscribe = window.electronAPI.onCopyProgress((progress) => {
      useScanStore.getState().patchCopy({
        copied: progress.copied,
        total: progress.total,
        failed: progress.failed,
        batchIndex: progress.batchIndex,
        batchTotal: progress.batchTotal,
      })
    })

    try {
      const result = await window.electronAPI.copyTaskImages(
        task.id,
        target.path,
      )

      useScanStore.getState().patchCopy({
        running: false,
        copied: result.copied,
        failed: result.failed.length,
      })

      const renamed = result.renamed ? `，${result.renamed} 张重名已改名` : ''

      showToast(
        '复制完成',
        `已复制 ${result.copied} 张${renamed}`,
        result.failed.length ? 'error' : 'success',
      )
    } catch (cause) {
      const message = toErrorMessage(cause, '复制过程中发生未知错误')

      useScanStore.getState().setCopy(null)
      showToast('复制失败', message, 'error')
    } finally {
      unsubscribe()
    }
  }, [task, showToast])

  const percent =
    copy && copy.total > 0 ? Math.round((copy.copied / copy.total) * 100) : 0

  const canCopy =
    Boolean(task) &&
    (task?.status === 'completed' || task?.status === 'canceled') &&
    (task?.totalImages ?? 0) > 0 &&
    !copy?.running

  return { handleCopy, canCopy, percent, copy }
}
