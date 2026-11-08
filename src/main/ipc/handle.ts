import { ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'

import { IPC_INVOKE } from '../../shared/ipc'
import type { ElectronAPI } from '../../shared/ipc'
import { logger } from '../services/log'
import { summarizeIpcArgs } from './log-summary'

type InvokeMethod = keyof typeof IPC_INVOKE

type IpcArgs<K extends InvokeMethod> = Parameters<ElectronAPI[K]>

type IpcResult<K extends InvokeMethod> =
  ReturnType<ElectronAPI[K]> | Awaited<ReturnType<ElectronAPI[K]>>

type Handler<K extends InvokeMethod> = (
  event: IpcMainInvokeEvent,
  ...args: IpcArgs<K>
) => IpcResult<K>

/**
 * `ipcMain.handle` 的统一包装：记录通道、耗时与安全摘要。
 *
 * 只接受通道描述表里的方法名，通道字符串从 `IPC_INVOKE` 取；参数类型
 * 来自 `ElectronAPI` 的对应方法，handler 与 preload 的签名不会各写一份。
 *
 * - 成功写 debug，失败写 warn 后原样抛出，渲染层收到的错误文案不变；
 * - 关闭日志时跳过参数摘要，避免无谓的序列化；
 * - handler 变成 async 不影响 `invoke` 契约，`ipcMain.handle` 本来就按 Promise 处理。
 */
export const handle = <K extends InvokeMethod>(
  method: K,
  listener: Handler<K>,
): void => {
  const channel = IPC_INVOKE[method]

  ipcMain.handle(channel, async (event, ...rawArgs: unknown[]) => {
    const args = rawArgs as IpcArgs<K>
    const enabled = logger.isEnabled()
    const startedAt = Date.now()
    const argsSummary = enabled ? summarizeIpcArgs(method, args) : undefined

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
