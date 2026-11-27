import { app } from 'electron'
import { readdir } from 'node:fs/promises'
import { basename, join } from 'node:path'

import type {
  AoiMachine,
  AoiSettings,
  AppPreferences,
  AppSettings,
  CategoryConfig,
  EntrySetupResult,
  LxtMachine,
  LxtSettings,
  LxtShare,
  MachineInfo,
  PlMachine,
  PlSettings,
  ScanCategory,
  ShareState,
  SkippedLink,
} from '../../../shared/ipc'

import {
  DEFAULT_PREFERENCES,
  elPlantOf,
  LXT_SHARES,
  PERFORMANCE_PROFILES,
  PREFERENCE_RANGE,
  THEME_APPEARANCES,
  UI_DENSITIES,
  UI_SCALES,
} from '../../../shared/ipc'
import {
  DEFAULT_HISTORY_LIMIT,
  normalizeHistoryLimit,
} from '../../../shared/historyLimit'
import {
  normalizeScanCategory,
  SCAN_CATEGORY_LABEL,
} from '../../../shared/scanCategories'
import { ENTRY_DESCRIPTORS } from '../discovery/categories'
import { machineKey, splitMachine } from '../discovery/shortcuts'
import type { Discovery } from '../discovery/shortcuts'
import { logger } from '../log'
import { describeAccessError } from '../scanner/diagnosis'
import { probeLxtShare, probePlShare } from '../scanner/resolver'
import { toFsPath } from '../../utils/pathx'
import { envOverriddenKeys } from './load'
import { createSettingsStore } from './store'
import type { SettingsChangeListener, SettingsStore } from './store'

export type { SettingsChangeListener } from './store'

const SETTINGS_VERSION = 2 as const

/** EL 的工序层目录名，协议固定值；不再作为配置字段落盘 */
export const ENTRY = 'EL'

/** `settings.json` 的绝对路径；主进程与设置页说明卡共用同一份 */
export const settingsFilePath = (): string =>
  join(app.getPath('userData'), 'settings.json')

const emptyCategory = <M>(): CategoryConfig<M> => ({
  entryRoot: null,
  machines: [],
  skipped: [],
  updatedAt: null,
  typeCatalog: [],
})

/** 默认配置；导出来给回归测试校验契约形状 */
export const defaultSettings = (): AppSettings => ({
  version: SETTINGS_VERSION,
  historyLimit: DEFAULT_HISTORY_LIMIT,
  preferences: { ...DEFAULT_PREFERENCES },
  categories: {
    el: emptyCategory<MachineInfo>(),
    lxt: emptyCategory<LxtMachine>(),
    pl: emptyCategory<PlMachine>(),
    aoi: emptyCategory<AoiMachine>(),
  },
  envOverrides: [],
})

const clampPreference = (
  value: unknown,
  key: keyof typeof PREFERENCE_RANGE,
  fallback: number,
): number => {
  const parsed = typeof value === 'number' ? value : Number(value)

  if (!Number.isFinite(parsed)) return fallback

  const { min, max, step } = PREFERENCE_RANGE[key]
  const clamped = Math.min(max, Math.max(min, Math.round(parsed)))
  const maxSteps = Math.floor((max - min) / step)
  const steps = Math.min(
    maxSteps,
    Math.max(0, Math.round((clamped - min) / step)),
  )

  return min + steps * step
}

export const normalizePreferences = (raw: unknown): AppPreferences => {
  const source =
    raw !== null && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Partial<AppPreferences>)
      : {}
  const merged = { ...DEFAULT_PREFERENCES, ...source }
  const layouts = ['flat', 'machine', 'type', 'machine-type'] as const
  const conflicts = ['rename', 'skip', 'overwrite'] as const

  return {
    appearance: THEME_APPEARANCES.includes(merged.appearance)
      ? merged.appearance
      : DEFAULT_PREFERENCES.appearance,
    density: UI_DENSITIES.includes(merged.density)
      ? merged.density
      : DEFAULT_PREFERENCES.density,
    scale: UI_SCALES.includes(merged.scale)
      ? merged.scale
      : DEFAULT_PREFERENCES.scale,
    copyLayout: layouts.includes(merged.copyLayout)
      ? merged.copyLayout
      : DEFAULT_PREFERENCES.copyLayout,
    copyConflict: conflicts.includes(merged.copyConflict)
      ? merged.copyConflict
      : DEFAULT_PREFERENCES.copyConflict,
    performanceProfile: PERFORMANCE_PROFILES.includes(merged.performanceProfile)
      ? merged.performanceProfile
      : DEFAULT_PREFERENCES.performanceProfile,
    copyBatchSize: clampPreference(
      merged.copyBatchSize,
      'copyBatchSize',
      DEFAULT_PREFERENCES.copyBatchSize,
    ),
    debugLogEnabled: merged.debugLogEnabled === true,
    updateAutoCheckEnabled:
      typeof merged.updateAutoCheckEnabled === 'boolean'
        ? merged.updateAutoCheckEnabled
        : DEFAULT_PREFERENCES.updateAutoCheckEnabled,
  }
}

const normalizeLxtShare = (value: unknown): ShareState<LxtShare> => {
  if (value === '') return ''
  if (LXT_SHARES.includes(value as LxtShare)) return value as LxtShare

  return null
}

const normalizePlShare = (value: unknown): ShareState =>
  value === '' ? '' : typeof value === 'string' && value.trim() ? value : null

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export const normalizeTypeCatalog = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()
  const result: string[] = []

  for (const item of value) {
    if (typeof item !== 'string') continue

    const trimmed = item.trim()
    if (!trimmed || seen.has(trimmed)) continue

    seen.add(trimmed)
    result.push(trimmed)
  }

  return result
}

const normalizeSkipped = (value: unknown): SkippedLink[] =>
  (Array.isArray(value) ? value : [])
    .filter(isRecord)
    .map((item) => ({
      plant: typeof item.plant === 'string' ? item.plant : '',
      file: typeof item.file === 'string' ? item.file : '',
      reason: typeof item.reason === 'string' ? item.reason : '',
    }))
    .filter((item) => item.file)

const normalizeCategoryBase = (raw: Record<string, unknown>) => ({
  entryRoot:
    typeof raw.entryRoot === 'string' && raw.entryRoot.trim()
      ? raw.entryRoot
      : null,
  skipped: normalizeSkipped(raw.skipped),
  updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
  typeCatalog: normalizeTypeCatalog(raw.typeCatalog),
})

const compareMachine = (a: string, b: string): number =>
  a.localeCompare(b, 'zh-CN', { numeric: true })

export const normalizeEl = (raw: unknown): CategoryConfig<MachineInfo> => {
  const source = isRecord(raw) ? raw : {}
  const machines: MachineInfo[] = []
  const seen = new Set<string>()

  for (const item of Array.isArray(source.machines) ? source.machines : []) {
    if (!isRecord(item)) continue

    const name = typeof item.name === 'string' ? item.name.trim() : ''
    const plant = name ? elPlantOf(name) : null

    if (!name || !plant || seen.has(name)) continue

    seen.add(name)
    machines.push({ name, plant })
  }

  machines.sort((a, b) => compareMachine(a.name, b.name))

  return { ...normalizeCategoryBase(source), machines }
}

/** 快捷方式入口类（LXT / PL / AOI）共用的归一化逻辑，差异仅在 share 字段校验 */
const normalizeShortcutCategory = <TShare>(
  raw: unknown,
  parseShare: (value: unknown) => TShare,
): CategoryConfig<{
  plant: string
  name: string
  key: string
  host: string
  share: TShare
  stale: boolean
}> => {
  const source = isRecord(raw) ? raw : {}
  const machines: Array<{
    plant: string
    name: string
    key: string
    host: string
    share: TShare
    stale: boolean
  }> = []
  const seen = new Set<string>()

  for (const item of Array.isArray(source.machines) ? source.machines : []) {
    if (!isRecord(item)) continue

    const plant = typeof item.plant === 'string' ? item.plant : ''
    const name = typeof item.name === 'string' ? item.name : ''
    const host = typeof item.host === 'string' ? item.host : ''

    if (!plant || !name || !host) continue

    const key = machineKey(plant, name)
    if (seen.has(key)) continue

    seen.add(key)
    machines.push({
      plant,
      name,
      key,
      host,
      share: parseShare(item.share),
      stale: item.stale === true,
    })
  }

  return { ...normalizeCategoryBase(source), machines }
}

export const normalizeLxt = (raw: unknown): LxtSettings =>
  normalizeShortcutCategory(raw, normalizeLxtShare)

export const normalizePl = (raw: unknown): PlSettings =>
  normalizeShortcutCategory(raw, normalizePlShare)

export const normalizeAoi = (raw: unknown): AoiSettings =>
  normalizeShortcutCategory(raw, (): null => null)

export const discoverMachines = async (
  rootPath: string,
): Promise<MachineInfo[]> => {
  const dirName = basename(rootPath)

  if (dirName !== 'DC') {
    throw new Error(
      `所选目录不是 DC 根目录（当前为「${dirName}」），请选择名为 DC 的目录`,
    )
  }

  let entries
  try {
    entries = await readdir(toFsPath(rootPath), { withFileTypes: true })
  } catch (error) {
    throw new Error(
      describeAccessError(error, rootPath, {
        permissionSuffix: '共享目录访问权限',
      }),
    )
  }

  const machines: MachineInfo[] = []

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue

    const plant = elPlantOf(entry.name)
    if (!plant) continue

    machines.push({ name: entry.name, plant })
  }

  machines.sort((a, b) => compareMachine(a.name, b.name))

  return machines
}

export const isAppSettings = (value: unknown): value is AppSettings =>
  typeof value === 'object' &&
  value !== null &&
  (value as AppSettings).version === SETTINGS_VERSION

const fallbackSettings = (): AppSettings => ({
  ...defaultSettings(),
  envOverrides: envOverriddenKeys(),
})

export const normalizeSettings = (
  raw: Record<string, unknown>,
): AppSettings => {
  const categories = raw.categories as Record<string, unknown> | undefined

  return {
    version: SETTINGS_VERSION,
    historyLimit: normalizeHistoryLimit(raw.historyLimit),
    preferences: normalizePreferences(raw.preferences),
    categories: {
      el: normalizeEl(categories?.el),
      lxt: normalizeLxt(categories?.lxt),
      pl: normalizePl(categories?.pl),
      aoi: normalizeAoi(categories?.aoi),
    },
    envOverrides: envOverriddenKeys(),
  }
}

export interface SharePatch {
  key: string
  share: ShareState
  host: string
}

export interface CategoryEntryDependencies {
  discoverEl?: (rootPath: string) => Promise<MachineInfo[]>
  discoverShortcut?: (
    category: 'lxt' | 'pl' | 'aoi',
    entryRoot: string,
  ) => Promise<Discovery>
  probeLxt?: (host: string, date: string) => Promise<ShareState<LxtShare>>
  probePl?: (
    host: string,
    name: string,
    plant: string,
    date: string,
  ) => Promise<ShareState>
  today?: () => string
}

const formatTodayYmd = (): string => {
  const now = new Date()
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('')
}

/**
 * 绑定到一个 `SettingsStore<AppSettings>` 的类别入口识别与共享缓存动作。
 *
 * 所有慢速目录枚举/网络探测一律在写锁外执行；回写阶段基于最新配置单次原子落盘。
 */
export const createCategoryEntryActions = (
  targetStore: SettingsStore<AppSettings>,
  deps: CategoryEntryDependencies = {},
) => {
  const discoverEl = deps.discoverEl ?? discoverMachines
  const discoverShortcut =
    deps.discoverShortcut ??
    ((category, entryRoot) => ENTRY_DESCRIPTORS[category].discover(entryRoot))
  const probeLxt = deps.probeLxt ?? probeLxtShare
  const probePl = deps.probePl ?? probePlShare
  const today = deps.today ?? formatTodayYmd

  const setupEntry = async (
    rawCategory: ScanCategory,
    rawEntryRoot: string,
  ): Promise<EntrySetupResult> => {
    const category = normalizeScanCategory(rawCategory)
    const trimmed = rawEntryRoot.trim()

    if (!trimmed) {
      throw new Error(
        category === 'el'
          ? '根目录不能为空，请输入或选择 DC 目录'
          : `入口目录不能为空，请选择${SCAN_CATEGORY_LABEL[category]}入口目录`,
      )
    }

    if (category === 'el') {
      // 在锁外枚举共享盘目录，避免阻塞并发偏好或缓存写入
      const machines = await discoverEl(trimmed)
      let added = 0
      let removed = 0

      const settings = await targetStore.update((current) => {
        const prevNames = new Set(
          current.categories.el.machines.map((item) => item.name),
        )
        const nextNames = new Set(machines.map((item) => item.name))

        added = machines.filter((item) => !prevNames.has(item.name)).length
        removed = current.categories.el.machines.filter(
          (item) => !nextNames.has(item.name),
        ).length

        return {
          ...current,
          categories: {
            ...current.categories,
            el: normalizeEl({
              ...current.categories.el,
              entryRoot: trimmed,
              machines,
              updatedAt: new Date().toISOString(),
            }),
          },
        }
      })

      return { settings, added, removed, relocated: 0 }
    }

    const discovery = await discoverShortcut(category, trimmed)
    let added = 0
    let removed = 0
    let relocated = 0

    const settings = await targetStore.update((current) => {
      const updatedAt = new Date().toISOString()

      if (category === 'lxt') {
        const merged = ENTRY_DESCRIPTORS.lxt.merge(
          current.categories.lxt.machines,
          discovery.machines,
        )
        added = merged.added
        removed = merged.removed
        relocated = merged.relocated

        return {
          ...current,
          categories: {
            ...current.categories,
            lxt: normalizeLxt({
              ...current.categories.lxt,
              entryRoot: trimmed,
              machines: merged.machines,
              skipped: discovery.skipped,
              updatedAt,
            }),
          },
        }
      }

      if (category === 'pl') {
        const merged = ENTRY_DESCRIPTORS.pl.merge(
          current.categories.pl.machines,
          discovery.machines,
        )
        added = merged.added
        removed = merged.removed
        relocated = merged.relocated

        return {
          ...current,
          categories: {
            ...current.categories,
            pl: normalizePl({
              ...current.categories.pl,
              entryRoot: trimmed,
              machines: merged.machines,
              skipped: discovery.skipped,
              updatedAt,
            }),
          },
        }
      }

      const merged = ENTRY_DESCRIPTORS.aoi.merge(
        current.categories.aoi.machines,
        discovery.machines,
      )
      added = merged.added
      removed = merged.removed
      relocated = merged.relocated

      return {
        ...current,
        categories: {
          ...current.categories,
          aoi: normalizeAoi({
            ...current.categories.aoi,
            entryRoot: trimmed,
            machines: merged.machines,
            skipped: discovery.skipped,
            updatedAt,
          }),
        },
      }
    })

    return { settings, added, removed, relocated }
  }

  const refreshEntry = async (
    rawCategory: ScanCategory,
  ): Promise<EntrySetupResult> => {
    const category = normalizeScanCategory(rawCategory)
    const current = await targetStore.read()
    const entryRoot = current.categories[category].entryRoot

    if (!entryRoot) {
      throw new Error(
        category === 'el'
          ? '尚未配置 DC 根目录，请先选择根目录'
          : `尚未配置${SCAN_CATEGORY_LABEL[category]}入口目录，请先选择入口`,
      )
    }

    return setupEntry(category, entryRoot)
  }

  /** 单次原子写回一批共享探测结果；主机地址已变或值未变时跳过对应项 */
  const rememberShares = async (
    category: 'lxt' | 'pl',
    patches: readonly SharePatch[],
  ): Promise<AppSettings> => {
    if (!patches.length) return targetStore.read()

    return targetStore.update((current) => {
      const target = current.categories[category]
      const byKey = new Map(patches.map((patch) => [patch.key, patch]))
      let changed = false

      const machines = target.machines.map((machine) => {
        const patch = byKey.get(machine.key)
        if (!patch) return machine
        if (machine.host !== patch.host || machine.share === patch.share) {
          return machine
        }

        changed = true
        return { ...machine, share: patch.share }
      })

      if (!changed) return current

      return {
        ...current,
        categories: {
          ...current.categories,
          [category]:
            category === 'lxt'
              ? normalizeLxt({ ...target, machines })
              : normalizePl({ ...target, machines }),
        } as AppSettings['categories'],
      }
    })
  }

  /** 扫描过程中异步回写单台共享名；失败只记日志，不中断扫描 */
  const rememberShareSafe = async (
    category: 'lxt' | 'pl',
    key: string,
    share: ShareState,
    host: string,
  ): Promise<void> => {
    try {
      await rememberShares(category, [{ key, share, host }])
    } catch (error) {
      console.error(
        `保存${SCAN_CATEGORY_LABEL[category]}共享探测结果失败:`,
        error,
      )
      logger.error('settings', `${category}-share.persist.failed`, {
        key,
        host,
        error,
      })
    }
  }

  /** 串行探测目标机台共享名后，以单次原子写落盘全部有效变更 */
  const reprobeShares = async (
    category: 'lxt' | 'pl',
    keys?: string[],
  ): Promise<AppSettings> => {
    const initial = await targetStore.read()
    const date = today()
    const targets = initial.categories[category].machines.filter(
      (item) => !item.stale && (keys ? keys.includes(item.key) : true),
    )

    const patches: SharePatch[] = []

    for (const machine of targets) {
      const share =
        category === 'lxt'
          ? await probeLxt(machine.host, date)
          : await (() => {
              const [plant, name] = splitMachine(machine.key)
              return probePl(machine.host, name, plant, date)
            })()

      // null 表示网络不通或未认证（结论不确定），保留原缓存；'' 与具体名称均有效落盘
      if (share !== null) {
        patches.push({ key: machine.key, share, host: machine.host })
      }
    }

    return rememberShares(category, patches)
  }

  return {
    setupEntry,
    refreshEntry,
    rememberShares,
    rememberShareSafe,
    reprobeShares,
  }
}

let store: SettingsStore<AppSettings> | null = null
let entryActions: ReturnType<typeof createCategoryEntryActions> | null = null
const settingsListeners = new Set<SettingsChangeListener<AppSettings>>()

const settingsStore = (): SettingsStore<AppSettings> =>
  (store ??= createSettingsStore({
    file: settingsFilePath(),
    fallback: fallbackSettings,
    isSupported: isAppSettings,
    normalize: normalizeSettings,
    serialize: ({ envOverrides: _runtime, ...persisted }) => persisted,
    onChange: async (previous, next) => {
      for (const listener of settingsListeners) {
        await listener(previous, next)
      }
    },
  }))

/** 订阅主进程配置落盘后的规范化变更；可在 store 惰性初始化之前提前注册 */
export const onSettingsChange = (
  listener: SettingsChangeListener<AppSettings>,
): (() => void) => {
  settingsListeners.add(listener)
  return () => {
    settingsListeners.delete(listener)
  }
}

const defaultEntryActions = () =>
  (entryActions ??= createCategoryEntryActions(settingsStore()))

export const readSettings = (): Promise<AppSettings> => settingsStore().read()

export const cleanupSettingsTempFiles = (): Promise<void> =>
  settingsStore().cleanupTemp()

const updateSettings = (
  mutate: (current: AppSettings) => AppSettings | Promise<AppSettings>,
): Promise<AppSettings> => settingsStore().update(mutate)

export const flushSettingsWrites = (): Promise<void> => settingsStore().flush()

export const setupEntryRoot = (
  category: ScanCategory,
  entryRoot: string,
): Promise<EntrySetupResult> =>
  defaultEntryActions().setupEntry(category, entryRoot)

export const refreshEntryMachines = (
  category: ScanCategory,
): Promise<EntrySetupResult> => defaultEntryActions().refreshEntry(category)

export const rememberCategoryShare = (
  category: 'lxt' | 'pl',
  key: string,
  share: ShareState,
  host: string,
): Promise<void> =>
  defaultEntryActions().rememberShareSafe(category, key, share, host)

export const reprobeCategoryShares = (
  category: 'lxt' | 'pl',
  keys?: string[],
): Promise<AppSettings> => defaultEntryActions().reprobeShares(category, keys)

export const saveHistoryLimit = (limit: number): Promise<AppSettings> =>
  updateSettings((current) => ({
    ...current,
    historyLimit: normalizeHistoryLimit(limit),
  }))

export const savePreferences = (
  patch: Partial<AppPreferences>,
): Promise<AppSettings> =>
  updateSettings((current) => ({
    ...current,
    preferences: normalizePreferences({
      ...current.preferences,
      ...patch,
    }),
  }))

export const saveTypeCatalog = (
  category: ScanCategory,
  types: string[],
): Promise<AppSettings> =>
  updateSettings((current) => {
    const typeCatalog = normalizeTypeCatalog(types)

    const categories = {
      ...current.categories,
      [category]: { ...current.categories[category], typeCatalog },
    } as AppSettings['categories']

    return { ...current, categories }
  })
