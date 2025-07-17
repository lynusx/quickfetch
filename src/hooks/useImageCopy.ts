import { useCallback, useEffect, useMemo, useRef } from 'react'

import useImageCopyStore from '../store/imageCopyStore'
import {
  copyFilesInBatches,
  getShiftInfo,
  isImage,
  writePathsToFile,
} from '../utils/common'

interface UseImageCopyProps {
  showToast: (
    title: string,
    message: string,
    type: 'success' | 'error' | 'info',
  ) => void
}

export const useImageCopy = ({ showToast }: UseImageCopyProps) => {
  const {
    currentScanRange,
    scannedFiles,
    plant,
    types,
    isManual,
    copiedFileCount,
    isScanning,
    isCopying,
    scanError,
    copyError,
    setCurrentScanRange,
    setPlant,
    setTypes,
    setIsManual,
    setScanningState,
    setScannedFiles,
    setScanError,
    setCopiedFileCount,
    setCopyingState,
  } = useImageCopyStore()

  const { shift, date, times } = getShiftInfo(new Date())

  const isFirstRender = useRef(true)

  useEffect(() => {
    if (isFirstRender.current) {
      // 组件挂载时总是设置初始值
      isFirstRender.current = false
      setCurrentScanRange({
        date,
        shift,
        times,
      })
    } else if (!isManual) {
      // 非首次渲染且isManual为false时，重置
      setCurrentScanRange({
        date,
        shift,
        times,
      })
    }
  }, [isManual])

  const mapTypesToNG = useCallback(() => {
    const typeMap: Record<string, string[]> = {
      脏污: ['NG_脏污_B', 'NG_脏污_C'],
      划伤: ['NG_划伤_B', 'NG_划伤_C'],
    }

    return types.flatMap((type) => typeMap[type as keyof typeof typeMap])
  }, [types])

  const ngTypes = useMemo(() => {
    return mapTypesToNG()
  }, [mapTypesToNG])

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
      fileCollector?: { path: string; fileHandle: FileSystemFileHandle }[]
    } = {},
  ): Promise<{ path: string; fileHandle: FileSystemFileHandle }[]> => {
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
  const handleSourceScan = useCallback(async () => {
    try {
      // 1. 重置状态
      setScannedFiles([])
      setScanError(null)
      setCopiedFileCount(0)

      // 2. 获取根目录句柄
      const rootDirHandle = await getDirectoryHandle('请选择有效目录')

      // 3. 设置扫描状态
      setScanningState(true)
      showToast('扫描开始', '正在扫描文件...', 'info')

      // 4. 验证目录名称
      if (rootDirHandle.name !== 'DC') {
        throw new Error('请选择名为 DC 的目录')
      }

      // 5. 收集符合条件的子目录
      const validDirs = await collectValidSubDirectories(rootDirHandle, plant)
      setCurrentScanRange({ directories: validDirs })

      // 6. 创建验证器
      const validators = createValidators(
        validDirs,
        currentScanRange.date,
        currentScanRange.shift,
        currentScanRange.times,
        ngTypes,
      )

      // 7. 遍历目录并收集文件
      const scannedFiles = await traverseDirectory(rootDirHandle, validators)

      // 8. 验证是否找到文件
      if (!scannedFiles.length) {
        throw new Error('未找到符合条件的文件')
      }

      // 9. 更新状态并显示结果
      setScannedFiles(scannedFiles)
      showToast('扫描完成', `共找到 ${scannedFiles.length} 张图片`, 'success')
    } catch (error) {
      // 10. 错误处理
      const errorMessage =
        error instanceof Error ? error.message : '扫描过程中发生未知错误'
      setScanError(errorMessage)
      showToast('扫描失败', errorMessage, 'error')
      console.error('扫描出错:', error)
    } finally {
      // 11. 结束扫描状态
      setScanningState(false)
    }
  }, [
    currentScanRange,
    plant,
    ngTypes,
    showToast,
    setScannedFiles,
    setScanError,
    setCopiedFileCount,
    setScanningState,
  ])

  // 复制文件
  const handleCopyFiles = useCallback(async () => {
    if (!scannedFiles.length) {
      showToast('操作提示', '请先扫描文件', 'info')
      return
    }

    try {
      // 1. 重置状态
      setCopiedFileCount(0)
      setScanError(null)

      // 2. 获取目标目录句柄
      const targetDirHandle = await getDirectoryHandle('请选择有效目录')

      // 3. 验证写入权限
      await verifyWritePermission(targetDirHandle)

      // 4. 显示开始提示
      setCopyingState(true)
      showToast('复制开始', '正在复制文件...', 'info')

      // 5. 写入路径到文件
      await writePathsToFile(
        targetDirHandle,
        scannedFiles.map((file) => file.path),
        'source.txt',
      )

      // 6. 批量复制文件
      await copyFilesInBatches(
        scannedFiles.map((file) => file.fileHandle),
        targetDirHandle,
        {
          batchSize: 10,
          onProgress: (copiedCount) => setCopiedFileCount(copiedCount),
          onError: (error, file) => {
            console.error(`${file.name}复制出错: ${error.message}`)
          },
        },
      )

      // 7. 显示成功提示
      showToast('复制完成', `已成功复制 ${copiedFileCount} 张图片`, 'success')
    } catch (error) {
      // 8. 错误处理
      const errorMessage =
        error instanceof Error ? error.message : '复制过程中发生未知错误'
      setScanError(errorMessage)
      showToast('复制失败', errorMessage, 'error')
      console.error('复制出错:', error)
    } finally {
      // 9. 结束复制状态
      setCopyingState(false)
    }
  }, [
    scannedFiles,
    plant,
    showToast,
    setCopiedFileCount,
    setScanError,
    setCopyingState,
  ])

  // 计算复制进度百分比
  const getCopyProgress = () => {
    if (!scannedFiles.length) return 0
    return Math.round((copiedFileCount / scannedFiles.length) * 100)
  }

  // 检测是否可以开始扫描
  const canStartScan = () => {
    return (
      types.length > 0 &&
      currentScanRange.times.length > 0 &&
      !isScanning &&
      !isCopying
    )
  }

  // 检测是否可以开始复制
  const canStartCopy = () => {
    return scannedFiles.length > 0 && !isScanning && !isCopying
  }

  return {
    // 状态
    scannedFiles,
    currentScanRange,
    ngTypes,
    plant,
    types,
    isManual,
    isScanning,
    isCopying,
    scanError,
    copyError,
    copiedFileCount,

    // 操作
    setPlant,
    setTypes,
    setIsManual,
    setCurrentScanRange,
    handleSourceScan,
    handleCopyFiles,

    // 计算属性
    canStartScan,
    canStartCopy,
    getCopyProgress,
  }
}
