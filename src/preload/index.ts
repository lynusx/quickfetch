import { contextBridge, ipcRenderer } from 'electron'

import type { CopyProgress, ElectronAPI, ScanProgress } from '../shared/ipc'

const api: ElectronAPI = {
  getVersion: () => ipcRenderer.invoke('app:version'),

  pickDirectory: (options) =>
    ipcRenderer.invoke('fs:pick-directory', options ?? {}),

  scanImages: (params, taskId) =>
    ipcRenderer.invoke('fs:scan-images', params, taskId),

  cancelScan: (taskId) => ipcRenderer.invoke('fs:cancel-scan', taskId),

  onScanProgress: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      progress: ScanProgress,
    ): void => listener(progress)

    ipcRenderer.on('fs:scan-progress', handler)

    return () => {
      ipcRenderer.removeListener('fs:scan-progress', handler)
    }
  },

  copyImages: (params) => ipcRenderer.invoke('fs:copy-images', params),

  onCopyProgress: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      progress: CopyProgress,
    ): void => listener(progress)

    ipcRenderer.on('fs:copy-progress', handler)

    return () => {
      ipcRenderer.removeListener('fs:copy-progress', handler)
    }
  },

  writeTextFile: (params) => ipcRenderer.invoke('fs:write-text-file', params),

  saveExcel: (params) => ipcRenderer.invoke('fs:save-excel', params),
}

contextBridge.exposeInMainWorld('electronAPI', api)
