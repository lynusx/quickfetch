import { app } from 'electron'
import { appendFile, mkdir, readdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'

import type { LogInfo, LogLevel } from '../../../shared/ipc'
import {
  LOG_RETENTION_DAYS,
  formatLogLine,
  isLogDayExpired,
  localDayKey,
  logFileName,
  parseLogDay,
} from './format'

/**
 * 运行时日志：批量追加到 userData/logs，按天分文件，保留 7 天。
 *
 * 任何写入异常都必须被吞掉 —— 日志是排障工具，不能反过来把扫描/复制搞崩。
 * 关闭时 `log()` 直接返回，不执行函数型 fields，热点循环没有额外分配。
 */

export type LogFields = Record<string, unknown>
export type LogFieldsInput = LogFields | (() => LogFields)

export interface Logger {
  readonly dir: string
  readonly retentionDays: number
  isEnabled(): boolean
  setEnabled(enabled: boolean): void
  log(
    level: LogLevel,
    scope: string,
    event: string,
    fields?: LogFieldsInput,
  ): void
  debug(scope: string, event: string, fields?: LogFieldsInput): void
  info(scope: string, event: string, fields?: LogFieldsInput): void
  warn(scope: string, event: string, fields?: LogFieldsInput): void
  error(scope: string, event: string, fields?: LogFieldsInput): void
  getInfo(): LogInfo
  flush(): Promise<void>
  close(timeoutMs?: number): Promise<void>
}

export interface LoggerOptions {
  dir: string
  retentionDays?: number
  now?: () => Date
  flushIntervalMs?: number
  maxQueueLines?: number
}

interface PendingLine {
  day: string
  line: string
}

const DEFAULT_FLUSH_INTERVAL_MS = 250
const DEFAULT_MAX_QUEUE_LINES = 5000

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

/** 只删本应用命名且早于保留期的文件；目录不存在/无权限都返回空数组 */
export const pruneOldLogs = async (
  dir: string,
  today: string,
  retentionDays = LOG_RETENTION_DAYS,
): Promise<string[]> => {
  const removed: string[] = []
  let entries

  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return removed
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue

    const day = parseLogDay(entry.name)

    if (!day || !isLogDayExpired(day, today, retentionDays)) continue

    try {
      await unlink(join(dir, entry.name))
      removed.push(entry.name)
    } catch {
      // 单个文件删不掉（被占用）不影响其余文件
    }
  }

  return removed.sort()
}

class FileLogger implements Logger {
  readonly dir: string
  readonly retentionDays: number

  private readonly now: () => Date
  private readonly flushIntervalMs: number
  private readonly maxQueueLines: number
  private readonly queue: PendingLine[] = []

  private enabled = false
  private closing = false
  private closed = false
  private timer: ReturnType<typeof setTimeout> | null = null
  private flushChain: Promise<void> = Promise.resolve()
  private closePromise: Promise<void> | null = null
  private lastPruneDay: string
  private dropped = 0
  private writeFailedNotified = false

  constructor(options: LoggerOptions) {
    this.dir = options.dir
    this.retentionDays = Math.max(
      1,
      Math.trunc(options.retentionDays ?? LOG_RETENTION_DAYS),
    )
    this.now = options.now ?? (() => new Date())
    this.flushIntervalMs = Math.max(
      10,
      options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS,
    )
    this.maxQueueLines = Math.max(
      1,
      Math.trunc(options.maxQueueLines ?? DEFAULT_MAX_QUEUE_LINES),
    )
    this.lastPruneDay = localDayKey(this.now())
  }

  isEnabled(): boolean {
    return this.enabled
  }

  setEnabled(enabled: boolean): void {
    if (this.closed || this.closing || enabled === this.enabled) return

    if (enabled) {
      this.enabled = true
      this.info('log', 'log.enabled', {
        dir: this.dir,
        retentionDays: this.retentionDays,
      })
      return
    }

    this.info('log', 'log.disabled', { dir: this.dir })
    this.enabled = false
    void this.flush()
  }

  log(
    level: LogLevel,
    scope: string,
    event: string,
    fields?: LogFieldsInput,
  ): void {
    if (!this.enabled || this.closing) return

    try {
      const at = this.now()
      const day = localDayKey(at)
      this.maybePrune(day)

      // 关闭时不会走到这里，函数型 fields 也就不会执行
      const resolved = typeof fields === 'function' ? fields() : fields
      this.enqueue(day, formatLogLine(level, scope, event, resolved, at))
    } catch (error) {
      console.error('写入日志失败:', error)
    }
  }

  debug(scope: string, event: string, fields?: LogFieldsInput): void {
    this.log('debug', scope, event, fields)
  }

  info(scope: string, event: string, fields?: LogFieldsInput): void {
    this.log('info', scope, event, fields)
  }

  warn(scope: string, event: string, fields?: LogFieldsInput): void {
    this.log('warn', scope, event, fields)
  }

  error(scope: string, event: string, fields?: LogFieldsInput): void {
    this.log('error', scope, event, fields)
  }

  getInfo(): LogInfo {
    const day = localDayKey(this.now())

    return {
      dir: this.dir,
      todayFile: join(this.dir, logFileName(day)),
      enabled: this.enabled,
      retentionDays: this.retentionDays,
    }
  }

  flush(): Promise<void> {
    this.flushChain = this.flushChain
      .then(() => this.drain())
      .catch(() => undefined)

    return this.flushChain
  }

  close(timeoutMs = 1000): Promise<void> {
    if (this.closePromise) return this.closePromise

    this.info('log', 'log.session.end', {})
    this.closing = true

    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }

    this.closePromise = Promise.race([this.flush(), sleep(timeoutMs)]).then(
      () => {
        this.closed = true
      },
    )

    return this.closePromise
  }

  private maybePrune(day: string): void {
    if (this.lastPruneDay === day) return

    this.lastPruneDay = day
    void pruneOldLogs(this.dir, day, this.retentionDays).catch(() => undefined)
  }

  private enqueue(day: string, line: string): void {
    this.queue.push({ day, line })

    if (this.queue.length > this.maxQueueLines) {
      const overflow = this.queue.length - this.maxQueueLines
      this.queue.splice(0, overflow)
      this.dropped += overflow
    }

    this.scheduleFlush()
  }

  private scheduleFlush(): void {
    if (this.timer || this.closing) return

    this.timer = setTimeout(() => {
      this.timer = null
      void this.flush()
    }, this.flushIntervalMs)
    this.timer.unref?.()
  }

  private async drain(): Promise<void> {
    if (!this.queue.length) return

    const batch = this.queue.splice(0, this.queue.length)

    if (this.dropped > 0) {
      const dropped = this.dropped
      this.dropped = 0
      batch.push({
        day: localDayKey(this.now()),
        line: formatLogLine('warn', 'log', 'log.overflow', { dropped }),
      })
    }

    const byDay = new Map<string, string[]>()

    for (const item of batch) {
      const lines = byDay.get(item.day)

      if (lines) lines.push(item.line)
      else byDay.set(item.day, [item.line])
    }

    for (const [day, lines] of byDay) {
      const file = join(this.dir, logFileName(day))
      const chunk = `${lines.join('\n')}\n`

      try {
        await mkdir(this.dir, { recursive: true })
        await appendFile(file, chunk, 'utf8')
      } catch {
        try {
          await appendFile(file, chunk, 'utf8')
        } catch (error) {
          if (!this.writeFailedNotified) {
            this.writeFailedNotified = true
            console.error('日志写入失败，后续日志可能丢失:', error)
          }
        }
      }
    }
  }
}

export const createLogger = (options: LoggerOptions): Logger =>
  new FileLogger(options)

/** 默认日志目录；只在初始化时调用，模块导入阶段不碰 Electron */
export const defaultLogDir = (): string => join(app.getPath('userData'), 'logs')

let active: Logger | null = null

export const initLogger = async (options: {
  enabled: boolean
  dir?: string
  retentionDays?: number
}): Promise<Logger> => {
  const dir = options.dir ?? defaultLogDir()
  const instance = createLogger({
    dir,
    retentionDays: options.retentionDays,
  })

  active = instance

  try {
    await mkdir(dir, { recursive: true })
  } catch {
    // 目录建不出来时继续创建实例；写盘会失败一次并提示一次
  }

  try {
    await pruneOldLogs(dir, localDayKey(new Date()), instance.retentionDays)
  } catch {
    // 清理失败不影响本次运行
  }

  instance.setEnabled(options.enabled)

  if (options.enabled) {
    instance.info('log', 'log.session.start', {
      pid: process.pid,
      platform: process.platform,
      dir,
      retentionDays: instance.retentionDays,
    })
  }

  return instance
}

/**
 * 全局单例。initLogger 之前所有写入都是 no-op，
 * 这样 verify 直接 import 业务模块时不会写盘或调用 app.getPath。
 */
export const logger: Logger = {
  get dir() {
    return active?.dir ?? ''
  },
  get retentionDays() {
    return active?.retentionDays ?? LOG_RETENTION_DAYS
  },
  isEnabled: () => active?.isEnabled() ?? false,
  setEnabled: (enabled) => active?.setEnabled(enabled),
  log: (level, scope, event, fields) =>
    active?.log(level, scope, event, fields),
  debug: (scope, event, fields) => active?.debug(scope, event, fields),
  info: (scope, event, fields) => active?.info(scope, event, fields),
  warn: (scope, event, fields) => active?.warn(scope, event, fields),
  error: (scope, event, fields) => active?.error(scope, event, fields),
  getInfo: () =>
    active?.getInfo() ?? {
      dir: '',
      todayFile: '',
      enabled: false,
      retentionDays: LOG_RETENTION_DAYS,
    },
  flush: () => active?.flush() ?? Promise.resolve(),
  close: (timeoutMs) => active?.close(timeoutMs) ?? Promise.resolve(),
}
