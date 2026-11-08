import { contextBridge, ipcRenderer } from 'electron'

import { IPC_EVENTS, IPC_INVOKE, IPC_SEND } from '../shared/ipc'
import type {
  CopyTask,
  ElectronAPI,
  ScanTask,
  UpdateState,
} from '../shared/ipc'

type InvokeMethod = keyof typeof IPC_INVOKE

/**
 * 普通 invoke 方法由通道描述表生成。
 *
 * 方法名与通道名只在一处维护；漏写或拼错在 `ElectronAPI` 与
 * `IPC_INVOKE` 之间就会变成类型错误，不必等到真机调用才发现。
 */
const invokes = Object.fromEntries(
  (Object.keys(IPC_INVOKE) as InvokeMethod[]).map((method) => [
    method,
    (...args: unknown[]) => ipcRenderer.invoke(IPC_INVOKE[method], ...args),
  ]),
) as Pick<ElectronAPI, InvokeMethod>

const subscribe = <T>(
  channel: string,
  listener: (value: T) => void,
): (() => void) => {
  const handler = (_event: Electron.IpcRendererEvent, value: T): void =>
    listener(value)

  ipcRenderer.on(channel, handler)

  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}

const api: ElectronAPI = {
  ...invokes,

  onUpdateState: (listener) =>
    subscribe<UpdateState>(IPC_EVENTS.updateState, listener),

  onScanTaskUpdate: (listener) =>
    subscribe<ScanTask>(IPC_EVENTS.scanTaskUpdate, listener),

  onCopyTaskUpdate: (listener) =>
    subscribe<CopyTask>(IPC_EVENTS.copyTaskUpdate, listener),

  logRenderer: (entry) => {
    try {
      ipcRenderer.send(IPC_SEND.logRenderer, entry)
    } catch {
      // 日志上报失败不能影响渲染层业务
    }
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)
