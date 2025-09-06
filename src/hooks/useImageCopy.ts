import { useCallback } from 'react'

import { copyFilesInBatches, isImage, writePathsToFile } from '../utils/common'
import { useImageFilterStore } from '../stores/imageFilterStore'
import { useImageStore } from '../stores/imageStore'

import type { Image } from '../types'

interface UseImageCopyProps {
  showToast: (
    title: string,
    message: string,
    type: 'success' | 'error' | 'info',
  ) => void
}

export const useImageCopy = ({ showToast }: UseImageCopyProps) => {
  const { plant, dirs, date, shift, times, types, setDirs } =
    useImageFilterStore()
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

  // 创建验证器函数数组
  const createValidators = (
    dirs: string[],
    date: string,
    shift: string,
    times: string[],
    types: string[],
  ) => {
    // 使用Set提高查找性能
    const dirSet = new Set(dirs)
    const timeSet = new Set(times)
    const typeSet = new Set(types)

    return [
      // 第0层级：目录名验证
      (name: string) => dirSet.has(name),

      // 第1层级：固定值'EL'
      (name: string) => name === 'EL',

      // 第2层级：日期验证
      (name: string) => name === date,

      // 第3层级：班次验证
      (name: string) => name === shift,

      // 第4层级：时间段验证
      (name: string) => timeSet.has(name),

      // 第5层级：类型验证
      (name: string) => typeSet.has(name),
    ]
  }

  // 递归处理目录层级
  const traverseDirectory = async (
    dirHandle: FileSystemDirectoryHandle,
    validators: ((name: string) => boolean)[],
    options: {
      currentDepth?: number
      currentPath?: string
      maxDepth?: number
      fileCollector?: Image[]
    } = {},
  ): Promise<Image[]> => {
    const {
      currentDepth = 0,
      currentPath = '',
      maxDepth = validators.length,
      fileCollector = [],
    } = options

    try {
      // 1. 获取当前目录下的所有项
      for await (const entry of dirHandle.values()) {
        // 2. 如果是文件且达到最大深度，处理文件
        if (currentDepth === maxDepth) {
          if (entry.kind === 'file') {
            // 检查是否为图片文件
            if (isImage(entry)) {
              const fullPath = `${currentPath}/${entry.name}`
              fileCollector.push({
                path: fullPath,
                fileHandle: entry,
              })
            }
          }
          continue
        }

        // 3. 在非最大深度遇到文件直接跳过
        if (entry.kind === 'file') {
          continue
        }

        // 4. 处理目录：验证当前层级
        if (validators[currentDepth](entry.name)) {
          const newPath =
            currentDepth === 0 ? entry.name : `${currentPath}/${entry.name}`

          // 验证通过，递归处理子目录
          await traverseDirectory(entry, validators, {
            currentDepth: currentDepth + 1,
            currentPath: newPath,
            maxDepth,
            fileCollector,
          })
        }
      }
    } catch (error) {
      console.error(`扫描目录${options.currentPath}出错:`, error)
    }

    return fileCollector
  }

  // 收集符合条件的子目录
  const collectValidSubDirectories = async (
    rootDirHandle: FileSystemDirectoryHandle,
    plant: string,
  ): Promise<string[]> => {
    const dirs: string[] = []

    const regStr = new RegExp(`^${plant}\\d+`)

    for await (const entry of rootDirHandle.values()) {
      if (entry.kind === 'directory' && regStr.test(entry.name)) {
        dirs.push(entry.name)
      }
    }

    return dirs
  }

  // 获取目录句柄
  const getDirectoryHandle = async (errorMessage: string) => {
    try {
      return await window.showDirectoryPicker({
        startIn: 'desktop',
      })
    } catch (error) {
      throw new Error(errorMessage)
    }
  }

  // 验证写入权限
  const verifyWritePermission = async (
    dirHandle: FileSystemDirectoryHandle,
  ): Promise<void> => {
    const permissionStatus = await dirHandle.queryPermission({
      mode: 'readwrite',
    })

    if (permissionStatus === 'granted') {
      return
    }

    const newPermissionStatus = await dirHandle.requestPermission({
      mode: 'readwrite',
    })

    if (newPermissionStatus !== 'granted') {
      throw new Error(`写入${dirHandle.name}目录权限被拒绝`)
    }
  }

  // 扫描源目录
  const handleImageScan = useCallback(async () => {
    try {
      // 1. 重置状态
      setImages([])
      setIsError(false)
      setError(null)
      setCopiedImageCount(0)

      // 2. 获取根目录句柄
      const rootDirHandle = await getDirectoryHandle('请选择有效目录')

      // 3. 设置扫描状态
      setIsScan(true)
      showToast('扫描开始', '正在扫描文件...', 'info')

      // 4. 验证目录名称
      if (rootDirHandle.name !== 'DC') {
        throw new Error('请选择名为 DC 的目录')
      }

      // 5. 收集符合条件的子目录
      const validDirs = await collectValidSubDirectories(rootDirHandle, plant)
      setDirs(validDirs)

      // 6. 创建验证器
      const validators = createValidators(dirs, date, shift, times, types)

      // 7. 遍历目录并收集文件
      const scannedFiles = await traverseDirectory(rootDirHandle, validators)

      // 8. 验证是否找到文件
      if (!scannedFiles.length) {
        throw new Error('未找到符合条件的文件')
      }

      // 9. 更新状态并显示结果
      setImages(scannedFiles)
      showToast('扫描完成', `共找到 ${scannedFiles.length} 张图片`, 'success')
    } catch (error) {
      // 10. 错误处理
      const err =
        error instanceof Error ? error : new Error('扫描过程中发生未知错误')

      setIsError(true)
      setError(err)
      showToast('扫描失败', err.message, 'error')
      console.error('扫描出错:', err.message)
    } finally {
      // 11. 结束扫描状态
      setIsScan(false)
    }
  }, [plant, dirs, date, shift, times, types])

  // 复制文件
  const handleImageCopy = useCallback(async () => {
    if (!images.length) {
      showToast('操作提示', '请先扫描文件', 'info')
      return
    }

    try {
      // 1. 重置状态
      setCopiedImageCount(0)
      setError(null)
      setIsError(false)

      // 2. 获取目标目录句柄
      const targetDirHandle = await getDirectoryHandle('请选择有效目录')

      // 3. 验证写入权限
      await verifyWritePermission(targetDirHandle)

      // 4. 显示开始提示
      setIsCopy(true)
      showToast('复制开始', '正在复制文件...', 'info')

      // 5. 写入路径到文件
      await writePathsToFile(
        targetDirHandle,
        images.map((img) => img.path),
        'source.txt',
      )

      // 6. 批量复制文件
      await copyFilesInBatches(
        images.map((img) => img.fileHandle),
        targetDirHandle,
        {
          batchSize: 10,
          onProgress: (copiedCount) => setCopiedImageCount(copiedCount),
          onError: (error, file) => {
            console.error(`${file.name}复制出错: ${error.message}`)
          },
        },
      )

      // 7. 显示成功提示
      showToast('复制完成', `已成功复制 ${copiedImageCount} 张图片`, 'success')
    } catch (error) {
      // 8. 错误处理
      const err =
        error instanceof Error ? error : new Error('复制过程中发生未知错误')

      setIsError(true)
      setError(err)
      showToast('复制失败', err.message, 'error')
    } finally {
      // 9. 结束复制状态
      setIsCopy(false)
    }
  }, [images, copiedImageCount])

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
