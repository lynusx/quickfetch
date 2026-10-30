import { contextBridge, ipcRenderer } from 'electron'

import type { CopyProgress, ElectronAPI, ScanTask } from '../shared/ipc'

const api: ElectronAPI = {
  getVersion: () => ipcRenderer.invoke('app:version'),

  pickDirectory: (options) =>
    ipcRenderer.invoke('fs:pick-directory', options ?? {}),

  readSettings: () => ipcRenderer.invoke('settings:read'),

  saveRootPath: (rootPath) =>
    ipcRenderer.invoke('settings:save-root', rootPath),

  refreshMachines: () => ipcRenderer.invoke('settings:refresh'),

  createScanTask: (params) => ipcRenderer.invoke('scan:create', params),

  startScanTask: (taskId) => ipcRenderer.invoke('scan:start', taskId),

  pauseScanTask: (taskId) => ipcRenderer.invoke('scan:pause', taskId),

  resumeScanTask: (taskId) => ipcRenderer.invoke('scan:resume', taskId),

  cancelScanTask: (taskId) => ipcRenderer.invoke('scan:cancel', taskId),

  getScanTask: (taskId) => ipcRenderer.invoke('scan:get', taskId),

  getScanTaskImages: (taskId, offset, limit) =>
    ipcRenderer.invoke('scan:images', taskId, offset, limit),

  onScanTaskUpdate: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, task: ScanTask): void =>
      listener(task)

    ipcRenderer.on('scan:task-update', handler)

    return () => {
      ipcRenderer.removeListener('scan:task-update', handler)
    }
  },

  listScanHistory: () => ipcRenderer.invoke('history:list'),

  loadScanHistory: (taskId) => ipcRenderer.invoke('history:load', taskId),

  deleteScanHistory: (taskId) => ipcRenderer.invoke('history:delete', taskId),

  clearScanHistory: () => ipcRenderer.invoke('history:clear'),

  setHistoryLimit: (limit) => ipcRenderer.invoke('history:set-limit', limit),

  copyTaskImages: (taskId, targetDir) =>
    ipcRenderer.invoke('copy:task', taskId, targetDir),

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

  saveExcel: (params) => ipcRenderer.invoke('fs:save-excel', params),
}

contextBridge.exposeInMainWorld('electronAPI', api)
