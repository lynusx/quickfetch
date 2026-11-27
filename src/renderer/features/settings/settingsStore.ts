import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

import { DEFAULT_PREFERENCES } from '@shared/ipc'
import type {
  AppPreferences,
  AppSettings,
  CategoryConfig,
  EntrySetupResult,
  PreferenceKey,
  ScanCategory,
} from '@shared/ipc'
import { SCAN_CATEGORY_LABEL } from '@shared/scanCategories'
import { toErrorMessage } from '@/utils/error'

interface SettingsState {
  settings: AppSettings | null
  loading: boolean
  saving: boolean
  error: string | null
}

interface SettingsAction {
  load: () => Promise<void>
  /** 设置某类入口根目录并识别机台；返回增量识别结果 */
  setupEntry: (
    category: ScanCategory,
    entryRoot: string,
  ) => Promise<EntrySetupResult | null>
  /** 按某类当前入口重新识别机台（力禧特/利珀自动串联共享重探） */
  refreshEntry: (category: ScanCategory) => Promise<EntrySetupResult | null>
  /** 调整历史保留条数，主进程会立即裁剪超额记录 */
  saveHistoryLimit: (limit: number) => Promise<void>
  /** 局部更新复制与性能偏好；界面先改再落盘，写失败会回滚 */
  savePreferences: (patch: Partial<AppPreferences>) => Promise<void>
  /** 强制重新探测共享目录并写回配置 */
  reprobeShares: (category: 'lxt' | 'pl') => Promise<boolean>
  /** 往某类的可选不良清单里加一项；界面先改再落盘，写失败会回滚 */
  addType: (category: ScanCategory, type: string) => Promise<void>
  /** 从某类的清单里删一项 */
  removeType: (category: ScanCategory, type: string) => Promise<void>
  clearError: () => void
}

/** 界面上直接用的偏好，配置还没读回来时给默认值 */
export const selectPreferences = (state: {
  settings: AppSettings | null
}): AppPreferences => state.settings?.preferences ?? DEFAULT_PREFERENCES

/**
 * 未加载配置时的稳定空类别配置。
 *
 * 必须使用模块级常量引用，避免 `useSyncExternalStore` 因每次返回新对象无限重渲染。
 */
const EMPTY_CATEGORY: CategoryConfig<never> = {
  entryRoot: null,
  machines: [],
  skipped: [],
  updatedAt: null,
  typeCatalog: [],
}

export const selectCategoryConfig =
  <K extends ScanCategory>(category: K) =>
  (state: { settings: AppSettings | null }): AppSettings['categories'][K] =>
    (state.settings?.categories[category] ??
      EMPTY_CATEGORY) as AppSettings['categories'][K]

/** 被环境变量接管、设置页里改了也不生效的项 */
export const selectEnvOverrides = (state: {
  settings: AppSettings | null
}): PreferenceKey[] => state.settings?.envOverrides ?? []

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

    setupEntry: async (category, entryRoot) => {
      set({ saving: true, error: null })
      const label =
        category === 'el'
          ? '保存根目录失败'
          : `识别${SCAN_CATEGORY_LABEL[category]}入口失败`

      try {
        const result = await window.electronAPI.setupEntryRoot(
          category,
          entryRoot,
        )
        set({ settings: result.settings })
        return result
      } catch (error) {
        set({ error: toErrorMessage(error, label) })
        return null
      } finally {
        set({ saving: false })
      }
    },

    refreshEntry: async (category) => {
      set({ saving: true, error: null })
      const hasShares = category === 'lxt' || category === 'pl'
      const label = hasShares
        ? '重新识别入口并探测共享失败'
        : '重新识别机台失败'

      try {
        const result = await window.electronAPI.refreshEntryMachines(category)
        set({ settings: result.settings })

        if (!hasShares) return result

        const reprobed = await window.electronAPI.reprobeShares(category)
        set({ settings: reprobed })
        return { ...result, settings: reprobed }
      } catch (error) {
        set({ error: toErrorMessage(error, label) })
        return null
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

        set((state) => {
          if (!state.settings) return { settings: saved, error: null }

          const preferences = { ...state.settings.preferences }

          for (const key of Object.keys(patch) as (keyof AppPreferences)[]) {
            if (preferences[key] === patch[key]) {
              Object.assign(preferences, { [key]: saved.preferences[key] })
            }
          }

          return {
            settings: {
              ...state.settings,
              preferences,
              envOverrides: saved.envOverrides,
            },
            error: null,
          }
        })
      } catch (error) {
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

    addType: (category, type) =>
      patchTypeCatalog(category, (types) =>
        types.includes(type) ? types : [...types, type],
      ),

    removeType: (category, type) =>
      patchTypeCatalog(category, (types) =>
        types.filter((item) => item !== type),
      ),

    clearError: () => set({ error: null }),
  })),
)

async function patchTypeCatalog(
  category: ScanCategory,
  mutate: (types: string[]) => string[],
): Promise<void> {
  const { settings } = useSettingsStore.getState()

  if (!settings) return

  const previous = settings.categories[category].typeCatalog
  const next = mutate(previous)

  if (
    next.length === previous.length &&
    next.every((type, index) => type === previous[index])
  ) {
    return
  }

  useSettingsStore.setState({
    settings: withTypeCatalog(settings, category, next),
    error: null,
  })

  try {
    const saved = await window.electronAPI.setTypeCatalog(category, next)

    useSettingsStore.setState({ settings: saved })
  } catch (error) {
    useSettingsStore.setState((state) => {
      const message = toErrorMessage(error, '保存类型清单失败')

      if (!state.settings) return { error: message }

      const current = state.settings.categories[category].typeCatalog

      if (
        current.length !== next.length ||
        current.some((type, index) => type !== next[index])
      ) {
        return { error: message }
      }

      return {
        settings: withTypeCatalog(state.settings, category, previous),
        error: message,
      }
    })
  }
}

const withTypeCatalog = (
  settings: AppSettings,
  category: ScanCategory,
  typeCatalog: string[],
): AppSettings => ({
  ...settings,
  categories: {
    ...settings.categories,
    [category]: { ...settings.categories[category], typeCatalog },
  } as AppSettings['categories'],
})
