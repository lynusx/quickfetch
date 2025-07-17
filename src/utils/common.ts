// 获取应用版本信息
export function getAppVersion(): string {
  try {
    // 在 Vite 环境中，可以通过 import.meta.env 获取版本信息
    // 或者从 package.json 中读取
    return import.meta.env.VITE_APP_VERSION || '0.0.0'
  } catch (error) {
    console.warn('无法获取版本信息:', error)
    return '0.0.0'
  }
}

// 获取班次信息
export const getShiftInfo = (timestamp: Date) => {
  const date = new Date(timestamp)
  const hour = date.getHours()
  const minute = date.getMinutes()

  // 1. 确定班次和日期
  // 白班：8:30-20:30（包含8:30，不包含20:30），夜班：20:30-8:30（包含20:30，不包含8:30）
  const isDayShift =
    (hour > 8 && hour < 20) ||
    (hour === 8 && minute >= 30) ||
    (hour === 20 && minute < 30)

  const shift: '白班' | '夜班' = isDayShift ? '白班' : '夜班'

  // 计算日期（跨天处理）
  const baseData = new Date(date)
  if (!isDayShift && (hour < 8 || (hour === 8 && minute < 30))) {
    baseData.setDate(baseData.getDate() - 1) // 跨天处理
  }
  const dateStr = formatDate(baseData)

  // 2. 计算整点数组
  const hoursArray = getShiftHours(shift, hour, minute)

  return { shift, date: dateStr, times: hoursArray }
}

// 格式化日期为 YYYYMMDD
const formatDate = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

// 计算班次对应的小时数组
const getShiftHours = (
  shift: '白班' | '夜班',
  currentHour: number,
  currentMinute: number,
) => {
  if (shift === '白班') {
    const endHour = currentHour < 20 ? currentHour : 19 // 20点整是下班点，只取到19
    return generateHourRange(8, endHour)
  }

  // 夜班处理
  if (currentHour >= 20) {
    return generateHourRange(20, currentHour)
  }

  // 跨天夜班：前一天20-23 + 当天0-当前小时
  return [
    ...generateHourRange(20, 23),
    ...generateHourRange(
      0,
      currentHour === 8 && currentMinute < 30 ? 7 : currentHour,
    ),
  ]
}

// 生成小时范围数组
const generateHourRange = (start: number, end: number) => {
  return Array.from({ length: end - start + 1 }, (_, i) => String(start + i))
}

// 获取所有的可选时间（用于手动选择）
export const getAllAvailableTimes = (shift: '白班' | '夜班') => {
  if (shift === '白班') {
    return generateHourRange(8, 19)
  } else {
    return [...generateHourRange(20, 23), ...generateHourRange(0, 7)]
  }
}

// 将路径列表写入指定文件
export const writePathsToFile = async (
  dirHandle: FileSystemDirectoryHandle,
  paths: string[],
  filename: string,
): Promise<void> => {
  let writableStream: FileSystemWritableFileStream | null = null

  try {
    // 1. 获取或创建文件句柄
    const fileHandle = await dirHandle.getFileHandle(filename, {
      create: true,
    })

    // 2. 创建可写流
    writableStream = await fileHandle.createWritable()

    // 3. 分块写入（避免在内存中拼接大字符串）
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100)

      // 将路径列表拼接为字符串
      const content = chunk.join('\n')
      await writableStream.write(content)
    }

    // 4. 确保写入完成
    await writableStream.close()
    writableStream = null
  } catch (error) {
    // 5. 错误处理
    const errorMessage = error instanceof Error ? error.message : '未知错误'

    console.error(`文件 ${filename} 写入失败: `, errorMessage)
  } finally {
    // 6. 确保资源清理
    if (writableStream) {
      try {
        await writableStream.close()
      } catch (cleanupError) {
        console.error('关闭可写流时出错:', cleanupError)
      }
    }
  }
}

// 文件复制
export const copyFileToDirectory = async (
  sourceFileHandle: FileSystemFileHandle,
  targetDirectoryHandle: FileSystemDirectoryHandle,
): Promise<void> => {
  let sourceFile: File | null = null
  let writableStream: FileSystemWritableFileStream | null = null

  try {
    // 1. 获取源文件内容
    sourceFile = await sourceFileHandle.getFile()

    // 2. 在目标目录中创建新文件
    const newFileHandle = await targetDirectoryHandle.getFileHandle(
      sourceFile.name,
      { create: true },
    )

    // 3. 创建可写流
    writableStream = await newFileHandle.createWritable()

    // 4. 使用流式传输复制文件内容
    const readableStream = sourceFile.stream()
    await readableStream.pipeTo(writableStream)
  } catch (error) {
    // 5. 错误处理
    const fileName = sourceFile?.name || '未知文件'
    const errorMessage = error instanceof Error ? error.message : '复制失败'

    console.error(`文件 ${fileName} 复制失败: `, errorMessage)
  }
}

// 批量复制文件
export const copyFilesInBatches = async (
  files: FileSystemFileHandle[],
  targetDirHandle: FileSystemDirectoryHandle,
  options: {
    batchSize?: number
    onProgress?: (copiedCount: number, total: number) => void
    onError?: (error: Error, file: FileSystemFileHandle) => void
  } = {},
): Promise<void> => {
  const { batchSize = 10, onProgress, onError } = options

  const total = files.length
  let copiedCount = 0

  // 1. 按批次处理文件
  for (let i = 0; i < total; i += batchSize) {
    const batch = files.slice(i, i + batchSize)
    const results = await Promise.allSettled(
      batch.map((file) => copyFileToDirectory(file, targetDirHandle)),
    )

    // 2. 处理本批次结果
    for (let j = 0; j < results.length; j++) {
      const result = results[j]

      if (result.status === 'fulfilled') {
        copiedCount++
      } else {
        const file = batch[j]
        const error = new Error(`文件复制失败: ${result.reason.message}`)

        if (onError) {
          onError(error, file)
        } else {
          console.error(error)
        }
      }

      // 3. 更新进度
      if (onProgress) {
        onProgress(copiedCount, total)
      }
    }
  }
}

// 判断是否为图片
export const isImage = (file: FileSystemFileHandle) => {
  const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.gif']
  return imageExtensions.some((ext) => file.name.toLowerCase().endsWith(ext))
}
