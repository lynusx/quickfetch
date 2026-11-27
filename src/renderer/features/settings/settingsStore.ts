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

export interface SettingsClientApi {
  readSettings: () => Promise<AppSettings>
  setupEntryRoot: (
    category: ScanCategory,
    entryRoot: string,
  ) => Promise<EntrySetupResult>
  refreshEntryMachines: (category: ScanCategory) => Promise<EntrySetupResult>
  reprobeShares: (
    category: 'lxt' | 'pl',
    keys?: string[],
  ) => Promise<AppSettings>
  setHistoryLimit: (limit: number) => Promise<AppSettings>
  savePreferences: (patch: Partial<AppPreferences>) => Promise<AppSettings>
  setTypeCatalog: (
    category: ScanCategory,
    types: string[],
  ) => Promise<AppSettings>
}

interface SettingsState {
  settings: AppSettings | null
  loading: boolean
  saving: boolean
  error: string | null
}

export interface LoadSettingsOptions {
  /** 为 true 时忽略已水合缓存，强制向主进程重新读取配置 */
  force?: boolean
}

interface SettingsAction {
  /**
   * 确保配置已水合；默认合并并发在途请求且已水合后直接短路，
   * 避免切换路由重复触发 IPC 与磁盘读取。
   */
  load: (options?: LoadSettingsOptions) => Promise<void>
  /** 设置某类入口根目录并识别机台；返回增量识别结果 */
  setupEntry: (
    category: ScanCategory,
    entryRoot: string,
  ) => Promise<EntrySetupResult | null>
  /** 按某类当前入口重新识别机台（力禧特/利珀自动串联共享重探） */
  refreshEntry: (category: ScanCategory) => Promise<EntrySetupResult | null>
  /** 调整历史保留条数；界面先改再落盘，写失败会按字段回滚 */
  saveHistoryLimit: (limit: number) => Promise<void>
  /** 局部更新复制与性能偏好；界面先改再落盘，写失败会按字段回滚 */
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

const sameStringArray = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((item, index) => item === b[index])

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

interface OptimisticSpec {
  errorLabel: string
  applyOptimistic: (current: AppSettings) => AppSettings
  request: () => Promise<AppSettings>
  commitSaved: (current: AppSettings, saved: AppSettings) => AppSettings
  rollback: (current: AppSettings, before: AppSettings) => AppSettings
}

/**
 * 创建渲染端配置 Store；测试可注入内存 API，生产默认惰性走 `window.electronAPI`。
 */
export const createRendererSettingsStore = (
  injectedApi?: SettingsClientApi,
) => {
  const api = (): SettingsClientApi => injectedApi ?? window.electronAPI
  let inflightLoad: Promise<void> | null = null
  let inflightToken: object | null = null

  const store = create<SettingsState & SettingsAction>()(
    devtools((set, get) => {
      const runOptimistic = async (spec: OptimisticSpec): Promise<void> => {
        const before = get().settings

        if (before) {
          set({ settings: spec.applyOptimistic(before), error: null })
        } else {
          set({ error: null })
        }

        try {
          const saved = await spec.request()
          set((state) => ({
            settings: state.settings
              ? spec.commitSaved(state.settings, saved)
              : saved,
            error: null,
          }))
        } catch (error) {
          const message = toErrorMessage(error, spec.errorLabel)
          set((state) =>
            state.settings && before
              ? {
                  settings: spec.rollback(state.settings, before),
                  error: message,
                }
              : { error: message },
          )
        }
      }

      const patchTypeCatalog = async (
        category: ScanCategory,
        mutate: (types: string[]) => string[],
      ): Promise<void> => {
        const current = get().settings
        if (!current) return

        const previous = current.categories[category].typeCatalog
        const next = mutate(previous)
        if (sameStringArray(next, previous)) return

        await runOptimistic({
          errorLabel: '保存类型清单失败',
          applyOptimistic: (base) => withTypeCatalog(base, category, next),
          request: () => api().setTypeCatalog(category, next),
          commitSaved: (latest, saved) =>
            sameStringArray(latest.categories[category].typeCatalog, next)
              ? withTypeCatalog(
                  latest,
                  category,
                  saved.categories[category].typeCatalog,
                )
              : latest,
          rollback: (latest, before) =>
            sameStringArray(latest.categories[category].typeCatalog, next)
              ? withTypeCatalog(
                  latest,
                  category,
                  before.categories[category].typeCatalog,
                )
              : latest,
        })
      }

      return {
        settings: null,
        loading: false,
        saving: false,
        error: null,

        load: (options) => {
          const force = options?.force === true

          if (!force && get().settings !== null) {
            return Promise.resolve()
          }

          if (!force && inflightLoad) {
            return inflightLoad
          }

          const token = {}
          inflightToken = token

          const run = (async () => {
            set({ loading: true, error: null })
            try {
              const settings = await api().readSettings()
              set({ settings })
            } catch (error) {
              set({ error: toErrorMessage(error, '读取配置失败') })
            } finally {
              if (inflightToken === token) {
                inflightToken = null
                inflightLoad = null
              }
              set({ loading: false })
            }
          })()

          inflightLoad = run
          return run
        },

        setupEntry: async (category, entryRoot) => {
          set({ saving: true, error: null })
          const label =
            category === 'el'
              ? '保存根目录失败'
              : `识别${SCAN_CATEGORY_LABEL[category]}入口失败`

          try {
            const result = await api().setupEntryRoot(category, entryRoot)
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
            const result = await api().refreshEntryMachines(category)
            set({ settings: result.settings })

            if (!hasShares) return result

            const reprobed = await api().reprobeShares(category)
            set({ settings: reprobed })
            return { ...result, settings: reprobed }
          } catch (error) {
            set({ error: toErrorMessage(error, label) })
            return null
          } finally {
            set({ saving: false })
          }
        },

        saveHistoryLimit: (limit) =>
          runOptimistic({
            errorLabel: '保存历史保留条数失败',
            applyOptimistic: (base) => ({ ...base, historyLimit: limit }),
            request: () => api().setHistoryLimit(limit),
            commitSaved: (latest, saved) =>
              latest.historyLimit === limit
                ? { ...latest, historyLimit: saved.historyLimit }
                : latest,
            rollback: (latest, before) =>
              latest.historyLimit === limit
                ? { ...latest, historyLimit: before.historyLimit }
                : latest,
          }),

        savePreferences: (patch) => {
          const keys = Object.keys(patch) as (keyof AppPreferences)[]

          return runOptimistic({
            errorLabel: '保存设置失败',
            applyOptimistic: (base) => ({
              ...base,
              preferences: { ...base.preferences, ...patch },
            }),
            request: () => api().savePreferences(patch),
            commitSaved: (latest, saved) => {
              const preferences = { ...latest.preferences }
              for (const key of keys) {
                if (preferences[key] === patch[key]) {
                  Object.assign(preferences, { [key]: saved.preferences[key] })
                }
              }
              return {
                ...latest,
                preferences,
                envOverrides: saved.envOverrides,
              }
            },
            rollback: (latest, before) => {
              const preferences = { ...latest.preferences }
              for (const key of keys) {
                if (preferences[key] === patch[key]) {
                  Object.assign(preferences, { [key]: before.preferences[key] })
                }
              }
              return { ...latest, preferences }
            },
          })
        },

        reprobeShares: async (category) => {
          set({ saving: true, error: null })
          try {
            const settings = await api().reprobeShares(category)
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
      }
    }),
  )

  return store
}

export const useSettingsStore = createRendererSettingsStore()
