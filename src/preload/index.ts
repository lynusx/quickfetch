import { contextBridge, ipcRenderer } from 'electron'

import type {
  CopyTask,
  ElectronAPI,
  ScanTask,
  UpdateState,
} from '../shared/ipc'

const api: ElectronAPI = {
  getVersion: () => ipcRenderer.invoke('app:version'),

  getUpdateState: () => ipcRenderer.invoke('update:get-state'),

  checkForUpdates: () => ipcRenderer.invoke('update:check'),

  downloadUpdate: () => ipcRenderer.invoke('update:download'),

  installUpdate: () => ipcRenderer.invoke('update:install'),

  openUpdateReleasePage: () => ipcRenderer.invoke('update:open-release-page'),

  onUpdateState: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, state: UpdateState) =>
      listener(state)

    ipcRenderer.on('update:state', handler)

    return () => {
      ipcRenderer.removeListener('update:state', handler)
    }
  },

  pickDirectory: (options) =>
    ipcRenderer.invoke('fs:pick-directory', options ?? {}),

  readSettings: () => ipcRenderer.invoke('settings:read'),

  saveRootPath: (rootPath) =>
    ipcRenderer.invoke('settings:save-root', rootPath),

  refreshMachines: () => ipcRenderer.invoke('settings:refresh'),

  savePreferences: (patch) =>
    ipcRenderer.invoke('settings:save-preferences', patch),

  setTypeCatalog: (category, types) =>
    ipcRenderer.invoke('settings:set-type-catalog', category, types),

  getLogInfo: () => ipcRenderer.invoke('logs:info'),

  openLogDir: () => ipcRenderer.invoke('logs:open'),

  logRenderer: (entry) => {
    try {
      ipcRenderer.send('log:renderer', entry)
    } catch {
      // 日志上报失败不能影响渲染层业务
    }
  },

  setupLxtRoot: (entryRoot) => ipcRenderer.invoke('lxt:setup-root', entryRoot),

  refreshLxtMachines: () => ipcRenderer.invoke('lxt:refresh'),

  setupPlRoot: (entryRoot) => ipcRenderer.invoke('pl:setup-root', entryRoot),

  refreshPlMachines: () => ipcRenderer.invoke('pl:refresh'),

  setupAoiRoot: (entryRoot) => ipcRenderer.invoke('aoi:setup-root', entryRoot),

  refreshAoiMachines: () => ipcRenderer.invoke('aoi:refresh'),

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

  previewCopyPlan: (taskId, params, targetDir) =>
    ipcRenderer.invoke('copy:preview', taskId, params, targetDir),

  startCopyTask: (taskId, targetDir, params) =>
    ipcRenderer.invoke('copy:start', taskId, targetDir, params),

  pauseCopyTask: (taskId) => ipcRenderer.invoke('copy:pause', taskId),

  resumeCopyTask: (taskId) => ipcRenderer.invoke('copy:resume', taskId),

  cancelCopyTask: (taskId) => ipcRenderer.invoke('copy:cancel', taskId),

  retryCopyFailures: (taskId) => ipcRenderer.invoke('copy:retry', taskId),

  getCopyTask: (taskId) => ipcRenderer.invoke('copy:get', taskId),

  onCopyTaskUpdate: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, task: CopyTask): void =>
      listener(task)

    ipcRenderer.on('copy:task-update', handler)

    return () => {
      ipcRenderer.removeListener('copy:task-update', handler)
    }
  },

  revealCopyTarget: (targetDir) => ipcRenderer.invoke('copy:reveal', targetDir),

  reprobeShares: (category, keys) =>
    ipcRenderer.invoke('share:reprobe', category, keys),

  saveExcel: (params) => ipcRenderer.invoke('fs:save-excel', params),
}

contextBridge.exposeInMainWorld('electronAPI', api)
