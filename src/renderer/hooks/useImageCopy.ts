import { useCallback } from 'react'

import { useImageStore } from '../stores/imageStore'
import { toErrorMessage } from '../utils/error'

interface UseImageCopyProps {
  showToast: (
    title: string,
    message: string,
    type: 'success' | 'error' | 'info',
  ) => void
}

/**
 * 复制步骤：把扫描结果按文件名平铺拷贝到目标目录，并写入 source.txt。
 * 与扫描步骤解耦，只依赖 store 里的 images。
 */
export const useImageCopy = ({ showToast }: UseImageCopyProps) => {
  const {
    images,
    isScan,
    isCopy,
    copiedImageCount,
    setCopiedImageCount,
    setIsCopy,
    setIsError,
    setError,
  } = useImageStore()

  const handleImageCopy = useCallback(async () => {
    if (!images.length) {
      showToast('操作提示', '请先扫描文件', 'info')
      return
    }

    let unsubscribe: (() => void) | undefined

    try {
      // 1. 重置状态
      setCopiedImageCount(0)
      setError(null)
      setIsError(false)

      // 2. 选择目标目录
      const target = await window.electronAPI.pickDirectory({
        title: '请选择目标目录',
      })

      if (!target) return

      // 3. 订阅主进程拷贝进度
      unsubscribe = window.electronAPI.onCopyProgress(({ copied }) => {
        setCopiedImageCount(copied)
      })

      setIsCopy(true)
      showToast('复制开始', '正在复制文件...', 'info')

      // 4. 写入路径清单
      await window.electronAPI.writeTextFile({
        dir: target.path,
        filename: 'source.txt',
        lines: images.map((img) => img.path),
      })

      // 5. 批量复制
      const result = await window.electronAPI.copyImages({
        files: images.map((img) => img.absolutePath),
        targetDir: target.path,
      })

      // 6. 结果提示
      if (result.failed.length) {
        showToast(
          '复制完成',
          `成功 ${result.copied} 张，失败 ${result.failed.length} 张`,
          'error',
        )
      } else {
        showToast('复制完成', `已成功复制 ${result.copied} 张图片`, 'success')
      }
    } catch (error) {
      const message = toErrorMessage(error, '复制过程中发生未知错误')

      setIsError(true)
      setError(new Error(message))
      showToast('复制失败', message, 'error')
    } finally {
      unsubscribe?.()
      setIsCopy(false)
    }
  }, [images, setCopiedImageCount, setError, setIsError, setIsCopy])

  // 计算复制进度百分比
  const getCopyProgress = () => {
    if (!images.length) return 0
    return Math.round((copiedImageCount / images.length) * 100)
  }

  // 检测是否可以开始复制
  const canStartCopy = () => images.length > 0 && !isScan && !isCopy

  return {
    handleImageCopy,
    canStartCopy,
    getCopyProgress,
  }
}
