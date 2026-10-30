import { app } from 'electron'
import { readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

import type { AppSettings, MachineInfo, Plant } from '../shared/ipc'

import {
  DEFAULT_HISTORY_LIMIT,
  normalizeHistoryLimit,
} from '../shared/historyLimit'
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
})

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
    }
  } catch {
    return defaultSettings()
  }
}

/** 原子写：先写临时文件再 rename，避免断电留下半截 JSON */
const writeSettings = async (settings: AppSettings): Promise<void> => {
  const target = settingsFile()
  const temp = `${target}.tmp`

  await writeFile(temp, JSON.stringify(settings, null, 2), 'utf-8')
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
    // 换根目录不该把历史保留条数重置回默认值
    historyLimit: current.historyLimit,
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
