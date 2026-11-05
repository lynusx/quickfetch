import type { LogLevel } from '../../../shared/ipc'

/**
 * 调试日志的纯逻辑：日期、文件名、保留判定、序列化与单行格式化。
 *
 * 这里刻意不 import electron / fs，方便 `scripts/verify-fixes.ts` 直接单测；
 * 真正写盘在 logger.ts。
 */

export const LOG_RETENTION_DAYS = 7
export const LOG_FILE_PREFIX = 'quickfetch-'
export const LOG_MAX_META_CHARS = 8192

const LOG_FILE_PATTERN = /^quickfetch-(\d{4})-(\d{2})-(\d{2})\.log$/
const TOKEN_PATTERN = /[^A-Za-z0-9_.:-]/g

const pad2 = (value: number): string => String(value).padStart(2, '0')

/** 本地日期，文件名与清理都以它为准 */
export const localDayKey = (date: Date): string =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`

const localTime = (date: Date): string =>
  `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}.${String(date.getMilliseconds()).padStart(3, '0')}`

export const logFileName = (day: string): string =>
  `${LOG_FILE_PREFIX}${day}.log`

/** 从文件名反解日期；命名不符或日期不存在（如 2026-02-31）返回 null */
export const parseLogDay = (fileName: string): string | null => {
  const match = LOG_FILE_PATTERN.exec(fileName)

  if (!match) return null

  const [, yearText, monthText, dayText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const date = new Date(Date.UTC(year, month - 1, day))

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }

  return `${yearText}-${monthText}-${dayText}`
}

/** 保留最近 N 个自然日（含今天），返回可保留的最早日期 */
export const retentionCutoffDay = (
  today: string,
  retentionDays = LOG_RETENTION_DAYS,
): string => {
  const [year, month, day] = today.split('-').map(Number)
  const keepDays = Math.max(1, Math.trunc(retentionDays))
  const cutoff = new Date(
    Date.UTC(year, month - 1, day) - (keepDays - 1) * 86_400_000,
  )

  return `${cutoff.getUTCFullYear()}-${pad2(cutoff.getUTCMonth() + 1)}-${pad2(cutoff.getUTCDate())}`
}

export const isLogDayExpired = (
  day: string,
  today: string,
  retentionDays = LOG_RETENTION_DAYS,
): boolean => day < retentionCutoffDay(today, retentionDays)

export interface SerializeOptions {
  maxDepth?: number
  maxArray?: number
  maxString?: number
  maxKeys?: number
  maxStack?: number
}

const DEFAULT_SERIALIZE_OPTIONS = {
  maxDepth: 4,
  maxArray: 20,
  maxString: 1000,
  maxKeys: 40,
  maxStack: 1500,
} as const

interface ResolvedOptions {
  maxDepth: number
  maxArray: number
  maxString: number
  maxKeys: number
  maxStack: number
}

const errorMessageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const truncate = (value: string, max: number): string =>
  value.length <= max
    ? value
    : `${value.slice(0, max)}…(+${value.length - max} chars)`

const serialize = (
  value: unknown,
  options: ResolvedOptions,
  ancestors: object[],
  depth: number,
): unknown => {
  if (value === null || value === undefined) return value

  const type = typeof value

  if (type === 'string') return truncate(value as string, options.maxString)
  if (type === 'number') {
    return Number.isFinite(value as number) ? value : String(value)
  }
  if (type === 'boolean') return value
  if (type === 'bigint') return `${String(value)}n`
  if (type === 'function') return '[Function]'
  if (type === 'symbol') return '[Symbol]'

  const object = value as object

  if (ancestors.includes(object)) return '[Circular]'

  if (value instanceof Date) return value.toISOString()

  if (depth >= options.maxDepth) {
    return Array.isArray(value) ? '[Array]' : '[Object]'
  }

  const nextAncestors = [...ancestors, object]
  const nextDepth = depth + 1

  if (value instanceof Error) {
    const extended = value as Error & {
      code?: unknown
      errno?: unknown
      syscall?: unknown
      path?: unknown
      address?: unknown
      port?: unknown
      cause?: unknown
    }
    const result: Record<string, unknown> = {
      name: value.name,
      message: truncate(value.message, options.maxString),
      stack: truncate(value.stack ?? '', options.maxStack),
    }

    if (
      typeof extended.code === 'string' ||
      typeof extended.code === 'number'
    ) {
      result.code = extended.code
    }
    if (typeof extended.errno === 'number') result.errno = extended.errno
    if (typeof extended.syscall === 'string') {
      result.syscall = extended.syscall
    }
    if (typeof extended.path === 'string') {
      result.path = truncate(extended.path, options.maxString)
    }
    if (typeof extended.address === 'string') {
      result.address = extended.address
    }
    if (typeof extended.port === 'number') result.port = extended.port
    if (extended.cause !== undefined) {
      result.cause = serialize(
        extended.cause,
        options,
        nextAncestors,
        nextDepth,
      )
    }

    return result
  }

  if (ArrayBuffer.isView(value)) {
    return { type: value.constructor.name, byteLength: value.byteLength }
  }

  if (value instanceof ArrayBuffer) {
    return { type: 'ArrayBuffer', byteLength: value.byteLength }
  }

  if (value instanceof Map) {
    const sample = Array.from(value.entries())
      .slice(0, 10)
      .map(([key, entry]) => [
        serialize(key, options, nextAncestors, nextDepth),
        serialize(entry, options, nextAncestors, nextDepth),
      ])

    return { type: 'Map', size: value.size, sample }
  }

  if (value instanceof Set) {
    const sample = Array.from(value.values())
      .slice(0, 10)
      .map((entry) => serialize(entry, options, nextAncestors, nextDepth))

    return { type: 'Set', size: value.size, sample }
  }

  if (Array.isArray(value)) {
    const items = value
      .slice(0, options.maxArray)
      .map((entry) => serialize(entry, options, nextAncestors, nextDepth))

    if (value.length > options.maxArray) {
      items.push(`[+${value.length - options.maxArray} more]`)
    }

    return items
  }

  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  const result: Record<string, unknown> = {}

  for (const key of keys.slice(0, options.maxKeys)) {
    try {
      result[key] = serialize(record[key], options, nextAncestors, nextDepth)
    } catch (error) {
      result[key] = `[Thrown: ${errorMessageOf(error)}]`
    }
  }

  if (keys.length > options.maxKeys) {
    result.__truncatedKeys = keys.length - options.maxKeys
  }

  return result
}

/** 把任意值压成可 JSON 序列化的安全结构；绝不输出文件字节或无限递归 */
export const serializeLogValue = (
  value: unknown,
  options: SerializeOptions = {},
): unknown =>
  serialize(value, { ...DEFAULT_SERIALIZE_OPTIONS, ...options }, [], 0)

const cleanToken = (value: string, max: number): string =>
  value.replace(TOKEN_PATTERN, '_').slice(0, max) || '_'

/**
 * 单行日志：
 * `2026-11-04 10:23:45.123 | INFO  | scan | scan.start | {"taskId":"t1"}`
 */
export const formatLogLine = (
  level: LogLevel,
  scope: string,
  event: string,
  fields?: Record<string, unknown>,
  at: Date = new Date(),
): string => {
  let meta = '{}'

  try {
    meta = JSON.stringify(serializeLogValue(fields ?? {})) ?? '{}'

    if (meta.length > LOG_MAX_META_CHARS) {
      meta = JSON.stringify({
        __truncated: true,
        preview: meta.slice(0, LOG_MAX_META_CHARS - 100),
      })
    }
  } catch {
    meta = '{"__unserializable":true}'
  }

  return `${localDayKey(at)} ${localTime(at)} | ${level.toUpperCase().padEnd(5)} | ${cleanToken(scope, 24)} | ${cleanToken(event, 48)} | ${meta}`
}
