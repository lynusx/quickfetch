import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

import { DEFAULT_PREFERENCES } from '@shared/ipc'
import type {
  AoiSettings,
  AoiSetupResult,
  AppPreferences,
  AppSettings,
  LxtSettings,
  LxtSetupResult,
  PlSettings,
  PlSetupResult,
  PreferenceKey,
} from '@shared/ipc'
import { toErrorMessage } from '@/utils/error'

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
  /** 设置利珀入口并解析其中的 .lnk */
  setupPl: (entryRoot: string) => Promise<PlSetupResult | null>
  /** 按当前入口重新识别利珀机台 */
  refreshPl: () => Promise<PlSetupResult | null>
  /** 设置森标 AOI 入口并解析其中的 .lnk */
  setupAoi: (entryRoot: string) => Promise<AoiSetupResult | null>
  /** 按当前入口重新识别森标 AOI 机台 */
  refreshAoi: () => Promise<AoiSetupResult | null>
  /**
   * 强制重新探测共享目录并写回配置。
   *
   * 现场换了共享名、或当初添加机台时没连上网络，都靠这个动作补救；
   * 自动探测只在 share 为 null 时跑一次，不会自己重来。
   */
  reprobeShares: (category: 'lxt' | 'pl') => Promise<boolean>
  clearError: () => void
}

/** 界面上直接用的偏好，配置还没读回来时给默认值 */
export const selectPreferences = (state: {
  settings: AppSettings | null
}): AppPreferences => state.settings?.preferences ?? DEFAULT_PREFERENCES

/**
 * 各类入口配置的稳定空值。
 *
 * 必须用模块级常量：settings 为空时若每次返回一个新对象，
 * useSyncExternalStore 会认为快照一直在变，直接在首屏触发无限更新。
 */
const EMPTY_LXT: LxtSettings = {
  entryRoot: null,
  machines: [],
  skipped: [],
  updatedAt: null,
}

const EMPTY_PL: PlSettings = {
  entryRoot: null,
  machines: [],
  skipped: [],
  updatedAt: null,
}

const EMPTY_AOI: AoiSettings = {
  entryRoot: null,
  machines: [],
  skipped: [],
  updatedAt: null,
}

/** 力禧特配置，未读回配置时给空值 */
export const selectLxt = (state: {
  settings: AppSettings | null
}): LxtSettings => state.settings?.lxt ?? EMPTY_LXT

/** 利珀配置，未读回配置时给空值 */
export const selectPl = (state: { settings: AppSettings | null }): PlSettings =>
  state.settings?.pl ?? EMPTY_PL

/** 森标 AOI 配置，未读回配置时给空值 */
export const selectAoi = (state: {
  settings: AppSettings | null
}): AoiSettings => state.settings?.aoi ?? EMPTY_AOI

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
        set((state) =>
          state.settings
            ? {
                settings: {
                  ...state.settings,
                  preferences: { ...state.settings.preferences, ...patch },
                },
              }
            : state,
        )
      }

      try {
        const saved = await window.electronAPI.savePreferences(patch)

        // 只合并本次 patch 的字段：并发的另一个 patch 可能已经更新了
        // 其他字段，整份替换会把它的结果盖掉。
        set((state) => {
          if (!state.settings) return { settings: saved, error: null }

          const preferences = { ...state.settings.preferences }

          for (const key of Object.keys(patch) as (keyof AppPreferences)[]) {
            // 同一字段若已被后一次写入改过，不要用这次较早的响应覆盖
            if (preferences[key] === patch[key]) {
              Object.assign(preferences, { [key]: saved.preferences[key] })
            }
          }

          return {
            settings: {
              ...state.settings,
              preferences,
              updatedAt: saved.updatedAt,
              envOverrides: saved.envOverrides,
            },
            error: null,
          }
        })
      } catch (error) {
        // 只回滚本次字段，且仅当它仍是本次乐观写入的值；
        // 已经被后续写入改过的字段保持不变。
        set((state) => {
          if (!state.settings) {
            return { error: toErrorMessage(error, '保存设置失败') }
          }

          const preferences = { ...state.settings.preferences }

          for (const key of Object.keys(patch) as (keyof AppPreferences)[]) {
            if (preferences[key] === patch[key] && before) {
              Object.assign(preferences, { [key]: before.preferences[key] })
            }
          }

          return {
            settings: { ...state.settings, preferences },
            error: toErrorMessage(error, '保存设置失败'),
          }
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
        set({ error: toErrorMessage(error, '识别力禧特EL入口失败') })
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

    setupPl: async (entryRoot) => {
      set({ saving: true, error: null })
      try {
        const result = await window.electronAPI.setupPlRoot(entryRoot)
        set({ settings: result.settings })
        return result
      } catch (error) {
        set({ error: toErrorMessage(error, '识别利珀PL入口失败') })
        return null
      } finally {
        set({ saving: false })
      }
    },

    refreshPl: async () => {
      set({ saving: true, error: null })
      try {
        const result = await window.electronAPI.refreshPlMachines()
        set({ settings: result.settings })
        return result
      } catch (error) {
        set({ error: toErrorMessage(error, '重新识别入口失败') })
        return null
      } finally {
        set({ saving: false })
      }
    },

    setupAoi: async (entryRoot) => {
      set({ saving: true, error: null })
      try {
        const result = await window.electronAPI.setupAoiRoot(entryRoot)
        set({ settings: result.settings })
        return result
      } catch (error) {
        set({ error: toErrorMessage(error, '识别森标 AOI 入口失败') })
        return null
      } finally {
        set({ saving: false })
      }
    },

    refreshAoi: async () => {
      set({ saving: true, error: null })
      try {
        const result = await window.electronAPI.refreshAoiMachines()
        set({ settings: result.settings })
        return result
      } catch (error) {
        set({ error: toErrorMessage(error, '重新识别入口失败') })
        return null
      } finally {
        set({ saving: false })
      }
    },

    reprobeShares: async (category) => {
      set({ saving: true, error: null })
      try {
        const settings = await window.electronAPI.reprobeShares(category)
        set({ settings })
        return true
      } catch (error) {
        set({ error: toErrorMessage(error, '重新探测共享失败') })
        return false
      } finally {
        set({ saving: false })
      }
    },

    clearError: () => set({ error: null }),
  })),
)
