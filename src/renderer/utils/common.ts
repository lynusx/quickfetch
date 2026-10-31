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

/**
 * 补零版时段：利珀的时段目录是 08、09、00 这种两位写法。
 *
 * 只影响展示和请求用的取值，不动 getShiftInfo 那套跨天判断 ——
 * 那里要拿真实时刻做比较，补零反而容易出错。
 */
const padHour = (hour: number): string => String(hour).padStart(2, '0')

export const getAllPaddedTimes = (shift: '白班' | '夜班') => {
  const hours =
    shift === '白班'
      ? Array.from({ length: 12 }, (_, i) => 8 + i)
      : [
          ...Array.from({ length: 4 }, (_, i) => 20 + i),
          ...Array.from({ length: 8 }, (_, i) => i),
        ]

  return hours.map(padHour)
}

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/** 毫秒转可读耗时：<1s 显示毫秒，其余保留一位小数秒 */
export const formatDuration = (ms: number): string =>
  ms < 1000 ? `${ms} 毫秒` : `${(ms / 1000).toFixed(1)} 秒`

/** 剩余时间：超过一分钟按分秒展示，避免「预计 143 秒」这种不好读的数字 */
export const formatEta = (ms: number | null): string | null => {
  if (ms === null || !Number.isFinite(ms)) return null
  if (ms <= 0) return '即将完成'
  if (ms < 60_000) return `约 ${Math.max(1, Math.round(ms / 1000))} 秒`

  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.round((ms % 60_000) / 1000)

  return seconds > 0 ? `约 ${minutes} 分 ${seconds} 秒` : `约 ${minutes} 分`
}
