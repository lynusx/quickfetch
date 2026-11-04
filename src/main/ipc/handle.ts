import { ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'

import { logger } from '../services/log'
import { summarizeIpcArgs } from './log-summary'

type Handler<Args extends unknown[], Result> = (
  event: IpcMainInvokeEvent,
  ...args: Args
) => Result

/**
 * `ipcMain.handle` 的统一包装：记录通道、耗时与安全摘要。
 *
 * - 成功写 debug，失败写 warn 后原样抛出，渲染层收到的错误文案不变；
 * - 关闭日志时跳过参数摘要，避免无谓的序列化；
 * - handler 变成 async 不影响 `invoke` 契约，`ipcMain.handle` 本来就按 Promise 处理。
 */
export const handle = <Args extends unknown[], Result>(
  channel: string,
  listener: Handler<Args, Result>,
): void => {
  ipcMain.handle(channel, async (event, ...rawArgs: unknown[]) => {
    const args = rawArgs as Args
    const enabled = logger.isEnabled()
    const startedAt = Date.now()
    const argsSummary = enabled ? summarizeIpcArgs(channel, args) : undefined

    try {
      const result = await listener(event, ...args)

      if (enabled) {
        logger.debug('ipc', channel, {
          ok: true,
          ms: Date.now() - startedAt,
          args: argsSummary,
        })
      }

      return result
    } catch (error) {
      if (enabled) {
        logger.warn('ipc', channel, {
          ok: false,
          ms: Date.now() - startedAt,
          args: argsSummary,
          error,
        })
      }

      throw error
    }
  })
}
