import { contextBridge, ipcRenderer } from 'electron'

import type { CopyProgress, ElectronAPI } from '../../src/types/electron'

const api: ElectronAPI = {
  getVersion: () => ipcRenderer.invoke('app:version'),

  pickDirectory: (options) =>
    ipcRenderer.invoke('fs:pick-directory', options ?? {}),

  scanImages: (params) => ipcRenderer.invoke('fs:scan-images', params),

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
