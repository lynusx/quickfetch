// 验证各机目录合法性
export const createValidators = (
  dirs: string[],
  date: string,
  shift: string,
  times: (string | number)[],
  types: string[],
) => [
  /**
   * @dirs []
   * @date string
   * @shift string
   * @times []
   * @types []
   */
  // A01-A\EL\20250528\夜班\2\NG_脏污_C\D1A_BIN081_1750660441_315_NG_133_脏污_20250529020856_plain.png

  // 第0层级：['A01-A', 'A01-B', ..., 'A10-A', 'A10-B']
  (name: string) => dirs.includes(name),

  // 第1层级：EL
  (name: string) => name === 'EL',

  // 第2层级：20250528
  (name: string) => name === date,

  // 第3层级：夜班
  (name: string) => name === shift,

  // 第4层级：[0, 1, 2, ..., 21, 22, 23]
  (name: string) => times.includes(name),

  // 第5层级：['NG_脏污_B', 'NG_脏污_C', 'NG_划伤_C']
  (name: string) => types.includes(name),
]

// 递归处理目录层级
export async function traverse(
  handle: any,
  depth: number,
  validators: ((name: string) => boolean)[],
  path: string,
  out: any[],
) {
  for await (const entry of handle.values()) {
    if (depth === validators.length) {
      // const file = await entry.getFile();
      // console.log(path, entry);
      const file = {
        path: path.concat('/', entry.name),
        handle: entry,
      }

      out.push(file)

      // console.log(out);
    }

    if (depth < validators.length && validators[depth](entry.name)) {
      const newPath =
        depth === 0 ? path.concat(entry.name) : path.concat('/', entry.name)
      await traverse(entry, depth + 1, validators, newPath, out)
    }
  }
}

// Write paths to pictures.txt
export async function writePathsToFile(
  dirHandle: any,
  paths: string[],
  filename: string,
) {
  try {
    const fileHandle = await dirHandle.getFileHandle(filename, {
      create: true,
    })
    const writableStream = await fileHandle.createWritable()
    const content = paths.join('\n')
    await writableStream.write(content)
    await writableStream.close()
    // eslint-disable-next-line no-unused-vars
  } catch (err) {
    throw new Error(`文件 ${filename} 创建失败`)
  }
}

// 文件复制
export async function copyFileToDirectory(
  sourceFileHandle: any,
  targetDirectoryHandle: any,
) {
  try {
    // 获取源文件内容
    const sourceFile = await sourceFileHandle.getFile()

    // 在目标目录中创建新文件
    const newFileHandle = await targetDirectoryHandle.getFileHandle(
      sourceFile.name,
      {
        create: true,
      },
    )

    // 创建可写流
    const writableStream = await newFileHandle.createWritable()

    // 将源文件内容写入新文件
    await writableStream.write(await sourceFile.arrayBuffer())

    // 关闭流
    await writableStream.close()

    return `文件${sourceFile.name}已成功复制到目标目录`
  } catch (err) {
    // throw new Error(`复制失败：${err.message}`);
    console.log(err)
  }
}

// 批量文件复制
export const copyFilesInBatches = async (
  files: any[],
  targetDirHandle: any,
  batchSize = 10,
  onProgress?: (progress: number) => void,
) => {
  const total = files.length
  const batches = Math.ceil(total / batchSize)

  for (let i = 0; i < batches; i++) {
    const start = i * batchSize
    const end = Math.min(start + batchSize, total)
    const batch = files.slice(start, end)

    await Promise.all(
      batch.map(async (file: any) => {
        await copyFileToDirectory(file.handle, targetDirHandle)
        onProgress && onProgress(start + batch.indexOf(file) + 1)
      }),
    )
  }
}

// 获取班次信息
export function getShiftInfo(timestamp: number | Date) {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = date.getHours()
  const minute = date.getMinutes()

  // 1. 确定班次和日期
  let shift
  let finalDateStr

  // 判断白班条件：8:30-20:30（包含8:30，不包含20:30）
  if (
    (hour > 8 && hour < 20) ||
    (hour === 8 && minute >= 30) ||
    (hour === 20 && minute < 30)
  ) {
    shift = '白班'
    finalDateStr = `${year}${month}${day}` // 白班使用当天日期
  } else {
    shift = '夜班'
    // 夜班跨天处理：0:00-8:30 使用前一天日期
    if (hour < 8 || (hour === 8 && minute < 30)) {
      const prevDay = new Date(timestamp)
      prevDay.setDate(prevDay.getDate() - 1)
      const prevYear = prevDay.getFullYear()
      const prevMonth = String(prevDay.getMonth() + 1).padStart(2, '0')
      const prevDayNum = String(prevDay.getDate()).padStart(2, '0')
      finalDateStr = `${prevYear}${prevMonth}${prevDayNum}`
    } else {
      finalDateStr = `${year}${month}${day}` // 20:30-23:59 使用当天日期
    }
  }

  // 2. 计算整点数组
  const hoursArray = []

  if (shift === '白班') {
    const start = 8
    const end = hour < 20 ? hour : 19 // 20点整是下班点，只取到19
    for (let h = start; h <= end; h++) {
      hoursArray.push(h)
    }
  } else {
    // 夜班处理
    if (hour >= 20) {
      // 当天20点至当前小时
      for (let h = 20; h <= hour; h++) {
        hoursArray.push(h)
      }
    } else {
      // 跨天部分：前一天20-23 + 当天0-当前小时
      for (let h = 20; h <= 23; h++) {
        hoursArray.push(h)
      }
      const endHour = hour === 8 ? 7 : hour // 8点整是下班点，只取到7
      for (let h = 0; h <= endHour; h++) {
        hoursArray.push(h)
      }
    }
  }

  // 3. 将数组转为字符串数字
  let finalHoursArray = hoursArray.map((item) => item.toString())

  return [finalDateStr, shift, finalHoursArray]
}

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
