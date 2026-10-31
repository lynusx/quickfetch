import { app } from 'electron'
import { readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

import type {
  AppPreferences,
  AppSettings,
  LxtMachine,
  LxtSettings,
  MachineInfo,
  Plant,
} from '../shared/ipc'

import {
  DEFAULT_PREFERENCES,
  LXT_SHARES,
  PREFERENCE_RANGE,
} from '../shared/ipc'
import {
  DEFAULT_HISTORY_LIMIT,
  normalizeHistoryLimit,
} from '../shared/historyLimit'
import { envOverriddenKeys } from './load'
import { lxtKey } from './lxt'
import { toFsPath } from './pathx'

const SETTINGS_VERSION = 1 as const
const ENTRY = 'EL'

const settingsFile = (): string =>
  join(app.getPath('userData'), 'settings.json')

const defaultSettings = (): AppSettings => ({
  version: SETTINGS_VERSION,
  rootPath: null,
  entry: ENTRY,
  machines: [],
  updatedAt: null,
  historyLimit: DEFAULT_HISTORY_LIMIT,
  preferences: { ...DEFAULT_PREFERENCES },
  lxt: { entryRoot: null, machines: [], skipped: [], updatedAt: null },
  envOverrides: [],
})

const clampInt = (
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number => {
  const parsed = typeof value === 'number' ? value : Number(value)

  if (!Number.isFinite(parsed)) return fallback

  return Math.min(max, Math.max(min, Math.round(parsed)))
}

/**
 * 归一化偏好：枚举值认不出就回落默认，数值按范围 clamp。
 *
 * 旧版本的 settings.json 没有 preferences 字段，这里必须能接住 ——
 * 用户升级后不该因为缺字段被重置根目录。
 */
export const normalizePreferences = (
  raw: Partial<AppPreferences> | null | undefined,
): AppPreferences => {
  const source = raw ?? {}
  const merged = { ...DEFAULT_PREFERENCES, ...source }
  const layouts = ['flat', 'machine', 'type', 'machine-type'] as const
  const conflicts = ['rename', 'skip', 'overwrite'] as const

  return {
    copyLayout: layouts.includes(merged.copyLayout)
      ? merged.copyLayout
      : DEFAULT_PREFERENCES.copyLayout,
    copyConflict: conflicts.includes(merged.copyConflict)
      ? merged.copyConflict
      : DEFAULT_PREFERENCES.copyConflict,
    scanConcurrency: clampInt(
      merged.scanConcurrency,
      PREFERENCE_RANGE.scanConcurrency.min,
      PREFERENCE_RANGE.scanConcurrency.max,
      DEFAULT_PREFERENCES.scanConcurrency,
    ),
    scanBatchSize: clampInt(
      merged.scanBatchSize,
      PREFERENCE_RANGE.scanBatchSize.min,
      PREFERENCE_RANGE.scanBatchSize.max,
      DEFAULT_PREFERENCES.scanBatchSize,
    ),
    copyConcurrency: clampInt(
      merged.copyConcurrency,
      PREFERENCE_RANGE.copyConcurrency.min,
      PREFERENCE_RANGE.copyConcurrency.max,
      DEFAULT_PREFERENCES.copyConcurrency,
    ),
    copyBatchSize: clampInt(
      merged.copyBatchSize,
      PREFERENCE_RANGE.copyBatchSize.min,
      PREFERENCE_RANGE.copyBatchSize.max,
      DEFAULT_PREFERENCES.copyBatchSize,
    ),
    lxtScanConcurrency: clampInt(
      merged.lxtScanConcurrency,
      PREFERENCE_RANGE.lxtScanConcurrency.min,
      PREFERENCE_RANGE.lxtScanConcurrency.max,
      DEFAULT_PREFERENCES.lxtScanConcurrency,
    ),
    lxtScanBatchSize: clampInt(
      merged.lxtScanBatchSize,
      PREFERENCE_RANGE.lxtScanBatchSize.min,
      PREFERENCE_RANGE.lxtScanBatchSize.max,
      DEFAULT_PREFERENCES.lxtScanBatchSize,
    ),
  }
}

/** 只认 el / SaveImages，认不出就当没探过，下次扫描补探 */
const normalizeShare = (value: unknown): LxtMachine['share'] =>
  LXT_SHARES.includes(value as (typeof LXT_SHARES)[number])
    ? (value as LxtMachine['share'])
    : null

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/**
 * 归一化力禧特配置。
 *
 * 机台的 key 一律按「厂区/机台」重算，不信任文件里存的那份 ——
 * 万一厂区名被手改过，key 和 plant 对不上，历史记录就关联不回去了。
 */
export const normalizeLxt = (raw: unknown): LxtSettings => {
  if (!isRecord(raw)) {
    return { entryRoot: null, machines: [], skipped: [], updatedAt: null }
  }

  const machines: LxtMachine[] = []
  const seen = new Set<string>()

  for (const item of Array.isArray(raw.machines) ? raw.machines : []) {
    if (!isRecord(item)) continue

    const plant = typeof item.plant === 'string' ? item.plant : ''
    const name = typeof item.name === 'string' ? item.name : ''
    const host = typeof item.host === 'string' ? item.host : ''

    if (!plant || !name || !host) continue

    const key = lxtKey(plant, name)
    if (seen.has(key)) continue

    seen.add(key)
    machines.push({
      plant,
      name,
      key,
      host,
      share: normalizeShare(item.share),
      stale: item.stale === true,
    })
  }

  const skipped = (Array.isArray(raw.skipped) ? raw.skipped : [])
    .filter(isRecord)
    .map((item) => ({
      plant: typeof item.plant === 'string' ? item.plant : '',
      file: typeof item.file === 'string' ? item.file : '',
      reason: typeof item.reason === 'string' ? item.reason : '',
    }))
    .filter((item) => item.file)

  return {
    entryRoot:
      typeof raw.entryRoot === 'string' && raw.entryRoot.trim()
        ? raw.entryRoot
        : null,
    machines,
    skipped,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
  }
}

/** 机台目录名首字母决定厂区：A 为东区、B 为西区 */
const plantOf = (name: string): Plant | null => {
  const head = name[0]?.toUpperCase()
  if (head === 'A') return 'east'
  if (head === 'B') return 'west'
  return null
}

/** 机台名按自然序排列，A02 排在 A01 之后而不是 A10 之后 */
const compareMachine = (a: string, b: string): number =>
  a.localeCompare(b, 'zh-CN', { numeric: true })

/**
 * 校验根目录并识别机台。
 *
 * DC 下会混有 .DS_Store、网络共享快捷方式等文件，必须 isDirectory 过滤；
 * 目录名隐藏项（以 . 开头）一并排除。
 */
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
    const code = (error as NodeJS.ErrnoException | undefined)?.code
    if (code === 'ENOENT') {
      throw new Error(`目录不存在或已被移动：${rootPath}，请重新选择`)
    }
    if (code === 'EACCES' || code === 'EPERM') {
      throw new Error(`没有读取「${rootPath}」的权限，请检查共享目录访问权限`)
    }
    throw new Error(
      `无法访问「${rootPath}」：${(error as Error)?.message ?? '未知错误'}`,
    )
  }

  const machines: MachineInfo[] = []

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue

    const plant = plantOf(entry.name)
    if (!plant) continue

    machines.push({ name: entry.name, plant })
  }

  machines.sort((a, b) => compareMachine(a.name, b.name))

  return machines
}

const isAppSettings = (value: unknown): value is AppSettings =>
  typeof value === 'object' &&
  value !== null &&
  (value as AppSettings).version === SETTINGS_VERSION

/** 读取配置；文件缺失或损坏时回落到默认值，不让应用起不来 */
export const readSettings = async (): Promise<AppSettings> => {
  try {
    const raw = await readFile(settingsFile(), 'utf-8')
    const parsed: unknown = JSON.parse(raw)

    if (!isAppSettings(parsed)) return defaultSettings()

    return {
      ...defaultSettings(),
      ...parsed,
      entry: ENTRY,
      // 老版本配置文件没有该字段，回落到默认值而不是 undefined
      historyLimit: normalizeHistoryLimit(parsed.historyLimit),
      // 同理：1.10.x 及更早的配置没有 preferences
      preferences: normalizePreferences(parsed.preferences),
      lxt: normalizeLxt(parsed.lxt),
      // 运行期字段，不落盘，每次读的时候按当前环境算
      envOverrides: envOverriddenKeys(),
    }
  } catch {
    return { ...defaultSettings(), envOverrides: envOverriddenKeys() }
  }
}

/** 原子写：先写临时文件再 rename，避免断电留下半截 JSON */
const writeSettings = async (settings: AppSettings): Promise<void> => {
  const target = settingsFile()
  const temp = `${target}.tmp`
  // envOverrides 是运行时算出来的，写进文件没有意义
  const { envOverrides: _runtime, ...persisted } = settings

  await writeFile(temp, JSON.stringify(persisted, null, 2), 'utf-8')
  await rename(temp, target)
}

/** 设置根目录：校验通过后立即识别机台并落盘，失败时不写坏数据 */
export const saveRootPath = async (rootPath: string): Promise<AppSettings> => {
  const trimmed = rootPath.trim()

  if (!trimmed) {
    throw new Error('根目录不能为空，请输入或选择 DC 目录')
  }

  const machines = await discoverMachines(trimmed)
  const current = await readSettings()
  const settings: AppSettings = {
    version: SETTINGS_VERSION,
    rootPath: trimmed,
    entry: ENTRY,
    machines,
    updatedAt: new Date().toISOString(),
    // 换根目录不该把历史保留条数与偏好重置回默认值
    historyLimit: current.historyLimit,
    preferences: current.preferences,
    lxt: current.lxt,
    envOverrides: current.envOverrides,
  }

  await writeSettings(settings)

  return settings
}

/** 重新识别机台；未配置根目录时直接返回当前配置 */
export const refreshMachines = async (): Promise<AppSettings> => {
  const current = await readSettings()

  if (!current.rootPath) return current

  const machines = await discoverMachines(current.rootPath)
  const settings: AppSettings = {
    ...current,
    machines,
    updatedAt: new Date().toISOString(),
  }

  await writeSettings(settings)

  return settings
}

/** 调整历史保留条数并立即裁剪，超出的旧记录直接删掉 */
export const saveHistoryLimit = async (limit: number): Promise<AppSettings> => {
  const current = await readSettings()
  const settings: AppSettings = {
    ...current,
    historyLimit: normalizeHistoryLimit(limit),
    updatedAt: new Date().toISOString(),
  }

  await writeSettings(settings)

  return settings
}

/** 局部更新偏好：只覆盖传进来的字段，其余保持原值 */
export const savePreferences = async (
  patch: Partial<AppPreferences>,
): Promise<AppSettings> => {
  const current = await readSettings()
  const settings: AppSettings = {
    ...current,
    preferences: normalizePreferences({ ...current.preferences, ...patch }),
    updatedAt: new Date().toISOString(),
  }

  await writeSettings(settings)

  return settings
}

/** 只替换力禧特那段配置，其余字段原样保留 */
export const saveLxt = async (lxt: LxtSettings): Promise<AppSettings> => {
  const current = await readSettings()
  const settings: AppSettings = {
    ...current,
    lxt: normalizeLxt(lxt),
    updatedAt: new Date().toISOString(),
  }

  await writeSettings(settings)

  return settings
}

/**
 * 回写单台机台探测到的共享名。
 *
 * 边扫边写，不攒到最后一起写：45 台可能跑十几分钟，中途崩了也不该
 * 把这十几分钟的探测结果全丢掉。写失败只记日志 —— 探测缓存丢失
 * 只是下次多探一次，不该让正在跑的扫描失败。
 */
export const rememberLxtShare = async (
  key: string,
  share: LxtSettings['machines'][number]['share'],
  host: string,
): Promise<void> => {
  try {
    const current = await readSettings()
    const index = current.lxt.machines.findIndex((item) => item.key === key)

    if (index < 0) return

    const machine = current.lxt.machines[index]

    // 期间入口被重新识别、IP 变了，这次探测结果已经过期，不能写回去
    if (machine.host !== host || machine.share === share) return

    const machines = [...current.lxt.machines]
    machines[index] = { ...machine, share }

    await saveLxt({ ...current.lxt, machines })
  } catch (error) {
    console.error('保存共享名探测结果失败:', error)
  }
}
