import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

import { DEFAULT_PREFERENCES } from '../../shared/ipc'
import type {
  AppPreferences,
  AppSettings,
  LxtSettings,
  LxtSetupResult,
  PreferenceKey,
} from '../../shared/ipc'
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
  /** 局部更新复制与性能偏好；界面先改再落盘，写失败会回滚 */
  savePreferences: (patch: Partial<AppPreferences>) => Promise<void>
  /** 设置力禧特入口并解析其中的 .lnk；成功时返回本次识别的增量信息 */
  setupLxt: (entryRoot: string) => Promise<LxtSetupResult | null>
  /** 按当前入口重新识别，与已有配置增量合并 */
  refreshLxt: () => Promise<LxtSetupResult | null>
  clearError: () => void
}

/** 界面上直接用的偏好，配置还没读回来时给默认值 */
export const selectPreferences = (state: {
  settings: AppSettings | null
}): AppPreferences => state.settings?.preferences ?? DEFAULT_PREFERENCES

/** 力禧特配置，未读回配置时给空值 */
export const selectLxt = (state: {
  settings: AppSettings | null
}): LxtSettings =>
  state.settings?.lxt ?? {
    entryRoot: null,
    machines: [],
    skipped: [],
    updatedAt: null,
  }

/** 被环境变量接管、设置页里改了也不生效的项 */
export const selectEnvOverrides = (state: {
  settings: AppSettings | null
}): PreferenceKey[] => state.settings?.envOverrides ?? []

/**
 * 根目录与机台列表由主进程持久化在 userData/settings.json，
 * 这里只做一层内存镜像，不再走 localStorage —— 主进程扫描时读的是磁盘上的配置。
 */
export const useSettingsStore = create<SettingsState & SettingsAction>()(
  devtools((set, get) => ({
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

    savePreferences: async (patch) => {
      const before = get().settings

      // 先把界面上的值改掉，滑杆与单选不会等一次 IPC 往返才跟手
      if (before) {
        set({
          settings: {
            ...before,
            preferences: { ...before.preferences, ...patch },
          },
        })
      }

      try {
        set({ settings: await window.electronAPI.savePreferences(patch) })
      } catch (error) {
        set({
          settings: before,
          error: toErrorMessage(error, '保存设置失败'),
        })
      }
    },

    setupLxt: async (entryRoot) => {
      set({ saving: true, error: null })
      try {
        const result = await window.electronAPI.setupLxtRoot(entryRoot)
        set({ settings: result.settings })
        return result
      } catch (error) {
        set({ error: toErrorMessage(error, '识别力禧特入口失败') })
        return null
      } finally {
        set({ saving: false })
      }
    },

    refreshLxt: async () => {
      set({ saving: true, error: null })
      try {
        const result = await window.electronAPI.refreshLxtMachines()
        set({ settings: result.settings })
        return result
      } catch (error) {
        set({ error: toErrorMessage(error, '重新识别入口失败') })
        return null
      } finally {
        set({ saving: false })
      }
    },

    clearError: () => set({ error: null }),
  })),
)
