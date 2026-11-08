import { ipcMain, shell } from 'electron'
import { mkdir } from 'node:fs/promises'

import type { LogInfo, LogLevel, RendererLogEntry } from '../../shared/ipc'
import { IPC_SEND } from '../../shared/ipc'
import { logger } from '../services/log'
import { handle } from './handle'

const LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error']
const MAX_ENTRIES_PER_SECOND = 100

const normalizeEntry = (value: unknown): RendererLogEntry | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const record = value as Record<string, unknown>
  const level = LEVELS.includes(record.level as LogLevel)
    ? (record.level as LogLevel)
    : 'warn'
  const scope =
    typeof record.scope === 'string' && record.scope
      ? record.scope.slice(0, 40)
      : 'renderer'
  const event =
    typeof record.event === 'string' && record.event
      ? record.event.slice(0, 60)
      : 'window.error'
  const meta =
    record.meta !== null &&
    typeof record.meta === 'object' &&
    !Array.isArray(record.meta)
      ? (record.meta as Record<string, unknown>)
      : undefined

  return { level, scope, event, meta }
}

export const registerLogsIpc = (): void => {
  handle('getLogInfo', (): LogInfo => logger.getInfo())

  handle('openLogDir', async (): Promise<string | null> => {
    const { dir } = logger.getInfo()

    if (!dir) return '日志目录尚未初始化'

    try {
      await mkdir(dir, { recursive: true })
    } catch {
      // 创建失败交给 openPath 返回可读错误
    }

    const error = await shell.openPath(dir)

    return error || null
  })

  let windowStartedAt = Date.now()
  let accepted = 0
  let dropped = 0

  ipcMain.on(IPC_SEND.logRenderer, (_event, value: unknown) => {
    try {
      const now = Date.now()

      if (now - windowStartedAt >= 1000) {
        if (dropped > 0) {
          logger.warn('renderer', 'renderer.log.rate-limited', { dropped })
        }

        windowStartedAt = now
        accepted = 0
        dropped = 0
      }

      if (accepted >= MAX_ENTRIES_PER_SECOND) {
        dropped += 1
        return
      }

      accepted += 1

      const entry = normalizeEntry(value)

      if (entry) {
        logger.log(entry.level, entry.scope, entry.event, entry.meta)
      }
    } catch {
      // 渲染层日志是尽力而为，绝不能让异常回到 Electron 事件循环
    }
  })
}
