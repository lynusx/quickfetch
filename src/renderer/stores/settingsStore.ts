import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

import type { AppSettings } from '../../shared/ipc'
import { toErrorMessage } from '../utils/error'

interface SettingsState {
  settings: AppSettings | null
  loading: boolean
  saving: boolean
  error: string | null
}

interface SettingsAction {
  load: () => Promise<void>
  saveRoot: (rootPath: string) => Promise<boolean>
  refresh: () => Promise<void>
  /** 调整历史保留条数，主进程会立即裁剪超额记录 */
  saveHistoryLimit: (limit: number) => Promise<void>
  clearError: () => void
}

/**
 * 根目录与机台列表由主进程持久化在 userData/settings.json，
 * 这里只做一层内存镜像，不再走 localStorage —— 主进程扫描时读的是磁盘上的配置。
 */
export const useSettingsStore = create<SettingsState & SettingsAction>()(
  devtools((set) => ({
    settings: null,
    loading: false,
    saving: false,
    error: null,

    load: async () => {
      set({ loading: true, error: null })
      try {
        set({ settings: await window.electronAPI.readSettings() })
      } catch (error) {
        set({ error: toErrorMessage(error, '读取配置失败') })
      } finally {
        set({ loading: false })
      }
    },

    saveRoot: async (rootPath) => {
      set({ saving: true, error: null })
      try {
        set({ settings: await window.electronAPI.saveRootPath(rootPath) })
        return true
      } catch (error) {
        set({ error: toErrorMessage(error, '保存根目录失败') })
        return false
      } finally {
        set({ saving: false })
      }
    },

    refresh: async () => {
      set({ saving: true, error: null })
      try {
        set({ settings: await window.electronAPI.refreshMachines() })
      } catch (error) {
        set({ error: toErrorMessage(error, '重新识别机台失败') })
      } finally {
        set({ saving: false })
      }
    },

    saveHistoryLimit: async (limit) => {
      set({ error: null })
      try {
        set({ settings: await window.electronAPI.setHistoryLimit(limit) })
      } catch (error) {
        set({ error: toErrorMessage(error, '保存历史保留条数失败') })
      }
    },

    clearError: () => set({ error: null }),
  })),
)
