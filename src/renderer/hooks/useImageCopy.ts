import { useCallback } from 'react'

import { useImageFilterStore } from '../stores/imageFilterStore'
import { useImageStore } from '../stores/imageStore'

interface UseImageCopyProps {
  showToast: (
    title: string,
    message: string,
    type: 'success' | 'error' | 'info',
  ) => void
}

// 主进程抛出的错误会被 Electron 加上 "Error invoking remote method ..." 前缀
const toErrorMessage = (error: unknown, fallback: string): string => {
  const raw = error instanceof Error ? error.message : fallback
  const index = raw.lastIndexOf('Error: ')

  return index >= 0 ? raw.slice(index + 7) : raw
}

export const useImageCopy = ({ showToast }: UseImageCopyProps) => {
  const { plant, date, shift, times, types, setDirs } = useImageFilterStore()
  const {
    images,
    isScan,
    isCopy,
    copiedImageCount,
    setImages,
    setIsCopy,
    setIsError,
    setIsScan,
    setError,
    setCopiedImageCount,
  } = useImageStore()

  // 扫描源目录：目录校验与 6 层规则遍历全部在主进程完成
  const handleImageScan = useCallback(async () => {
    try {
      // 1. 重置状态
      setImages([])
      setIsError(false)
      setError(null)
      setCopiedImageCount(0)

      // 2. 选择 DC 根目录
      const root = await window.electronAPI.pickDirectory({
        title: '请选择 DC 目录',
      })

      // 用户取消选择，直接结束
      if (!root) return

      // 3. 设置扫描状态
      setIsScan(true)
      showToast('扫描开始', '正在扫描文件...', 'info')

      // 4. 主进程扫描（含目录名校验）
      const { dirs, images: scannedImages } =
        await window.electronAPI.scanImages({
          rootPath: root.path,
          plant,
          date,
          shift,
          times,
          types,
        })

      // 5. 更新状态并显示结果
      setDirs(dirs)
      setImages(scannedImages)
      showToast('扫描完成', `共找到 ${scannedImages.length} 张图片`, 'success')
    } catch (error) {
      const message = toErrorMessage(error, '扫描过程中发生未知错误')

      setIsError(true)
      setError(new Error(message))
      showToast('扫描失败', message, 'error')
      console.error('扫描出错:', message)
    } finally {
      setIsScan(false)
    }
  }, [plant, date, shift, times, types, setDirs, setImages, setError])

  // 复制文件到目标目录
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
  }, [images, setCopiedImageCount, setError])

  // 计算复制进度百分比
  const getCopyProgress = () => {
    if (!images.length) return 0
    return Math.round((copiedImageCount / images.length) * 100)
  }

  // 检测是否可以开始扫描
  const canStartScan = () =>
    times.length > 0 && types.length > 0 && !isScan && !isCopy

  // 检测是否可以开始复制
  const canStartCopy = () => images.length > 0 && !isScan && !isCopy

  return {
    handleImageScan,
    handleImageCopy,
    canStartScan,
    canStartCopy,
    getCopyProgress,
  }
}
