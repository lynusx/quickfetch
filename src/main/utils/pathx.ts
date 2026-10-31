/**
 * Windows 传统路径 API 限制 260 字符，网络盘上的实际路径很容易接近这个上限
 * （共享名 + 机台 + 日期 + 班次 + 时段 + 类型 + 设备生成的图片名）。
 * 超过阈值时补上 `\\?\` 前缀，绕过长度限制；其余平台原样返回。
 */
const LONG_PATH_THRESHOLD = 240

const LONG_PREFIX = '\\\\?\\'
const UNC_PREFIX = '\\\\?\\UNC\\'

export const toFsPath = (path: string): string => {
  if (process.platform !== 'win32') return path
  if (path.length < LONG_PATH_THRESHOLD) return path
  if (path.startsWith(LONG_PREFIX)) return path

  // UNC 路径（\\server\share\...）要转成 \\?\UNC\server\share\...
  return path.startsWith('\\\\')
    ? `${UNC_PREFIX}${path.slice(2)}`
    : `${LONG_PREFIX}${path}`
}
