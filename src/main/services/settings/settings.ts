import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

import type {
  AoiMachine,
  AoiSettings,
  AppPreferences,
  AppSettings,
  CategoryConfig,
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
  PREFERENCE_RANGE,
} from '../../../shared/ipc'
import {
  DEFAULT_HISTORY_LIMIT,
  normalizeHistoryLimit,
} from '../../../shared/historyLimit'
import { envOverriddenKeys } from './load'
import { aoiKey } from '../discovery/aoi'
import { lxtKey } from '../discovery/lxt'
import { plKey } from '../discovery/pl'
import { logger } from '../log'
import { describeAccessError } from '../scanner/diagnosis'
import { toFsPath } from '../../utils/pathx'

const SETTINGS_VERSION = 2 as const

/** EL 的工序层目录名，协议固定值；不再作为配置字段落盘 */
export const ENTRY = 'EL'

const settingsFile = (): string =>
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

/**
 * 把偏好值压进对应档位：先 clamp 到 min/max，再按 step 取最近的合法值。
 *
 * 设置页的滑杆已经按 step 取点，这里再兜一层，避免旧 settings.json
 * 留下 55 这种不在步长上的值，滑杆一打开就先跳一格。
 */
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

/**
 * 归一化偏好：枚举值认不出就回落默认，数值按范围 clamp。
 *
 * 既有 settings.json 可能没有 preferences 字段，这里必须能接住 ——
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
    scanConcurrency: clampPreference(
      merged.scanConcurrency,
      'scanConcurrency',
      DEFAULT_PREFERENCES.scanConcurrency,
    ),
    scanBatchSize: clampPreference(
      merged.scanBatchSize,
      'scanBatchSize',
      DEFAULT_PREFERENCES.scanBatchSize,
    ),
    copyConcurrency: clampPreference(
      merged.copyConcurrency,
      'copyConcurrency',
      DEFAULT_PREFERENCES.copyConcurrency,
    ),
    copyBatchSize: clampPreference(
      merged.copyBatchSize,
      'copyBatchSize',
      DEFAULT_PREFERENCES.copyBatchSize,
    ),
    // 只认真正的 boolean：旧配置缺字段、手改成 "true" 都回落关闭
    debugLogEnabled: merged.debugLogEnabled === true,
  }
}

/**
 * 共享名三态归一化：
 * - 'el' / 'SaveImages' → 原样
 * - '' → 保留，表示"探过了，两边都没有"（不能折回 null，否则每次扫描重探一遍）
 * - 其余（含 null / 老配置里没有该字段）→ null，表示未探测
 */
const normalizeShare = (value: unknown): ShareState<LxtShare> => {
  if (value === '') return ''
  if (LXT_SHARES.includes(value as LxtShare)) return value as LxtShare

  return null
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/** 类型清单：trim、去空、去重、保留输入顺序 */
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

/** 四类共用的字段归一化；machines 由各自的 normalizer 补上 */
const normalizeCategoryBase = (raw: Record<string, unknown>) => ({
  entryRoot:
    typeof raw.entryRoot === 'string' && raw.entryRoot.trim()
      ? raw.entryRoot
      : null,
  skipped: normalizeSkipped(raw.skipped),
  updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
  typeCatalog: normalizeTypeCatalog(raw.typeCatalog),
})

/**
 * 归一化 EL 配置。
 *
 * EL 的机台是 DC 根下的目录名，没有主机与共享缓存；厂区继续按首字母规则
 * 重算，不信任文件里存的那份。
 */
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

/**
 * 归一化力禧特配置。
 *
 * 机台的 key 一律按「厂区/机台」重算，不信任文件里存的那份 ——
 * 万一厂区名被手改过，key 和 plant 对不上，历史记录就关联不回去了。
 */
export const normalizeLxt = (raw: unknown): LxtSettings => {
  const source = isRecord(raw) ? raw : {}
  const machines: LxtMachine[] = []
  const seen = new Set<string>()

  for (const item of Array.isArray(source.machines) ? source.machines : []) {
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

  return { ...normalizeCategoryBase(source), machines }
}

/**
 * 归一化利珀配置。
 *
 * 与力禧特一样按「厂区/机台」重算 key；share 是探测出来的标识目录名，
 * 没有固定候选，这里只做字符串校验，认不出就当没探过。
 */
export const normalizePl = (raw: unknown): PlSettings => {
  const source = isRecord(raw) ? raw : {}
  const machines: PlMachine[] = []
  const seen = new Set<string>()

  for (const item of Array.isArray(source.machines) ? source.machines : []) {
    if (!isRecord(item)) continue

    const plant = typeof item.plant === 'string' ? item.plant : ''
    const name = typeof item.name === 'string' ? item.name : ''
    const host = typeof item.host === 'string' ? item.host : ''

    if (!plant || !name || !host) continue

    const key = plKey(plant, name)
    if (seen.has(key)) continue

    seen.add(key)
    machines.push({
      plant,
      name,
      key,
      host,
      // 三态：null 未探测、'' 探过但没有、其余为标识目录名
      share:
        item.share === ''
          ? ''
          : typeof item.share === 'string' && item.share.trim()
            ? item.share
            : null,
      stale: item.stale === true,
    })
  }

  return { ...normalizeCategoryBase(source), machines }
}

/**
 * 归一化森标 AOI 配置。
 *
 * 与力禧特/利珀一样按「厂区/机台」重算 key；第二层按图片类型二选一，
 * 没有需要持久化的探测缓存，share 一律写成 null。
 */
export const normalizeAoi = (raw: unknown): AoiSettings => {
  const source = isRecord(raw) ? raw : {}
  const machines: AoiMachine[] = []
  const seen = new Set<string>()

  for (const item of Array.isArray(source.machines) ? source.machines : []) {
    if (!isRecord(item)) continue

    const plant = typeof item.plant === 'string' ? item.plant : ''
    const name = typeof item.name === 'string' ? item.name : ''
    const host = typeof item.host === 'string' ? item.host : ''

    if (!plant || !name || !host) continue

    const key = aoiKey(plant, name)
    if (seen.has(key)) continue

    seen.add(key)
    machines.push({
      plant,
      name,
      key,
      host,
      share: null,
      stale: item.stale === true,
    })
  }

  return { ...normalizeCategoryBase(source), machines }
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

/**
 * 把损坏/版本不认识的配置文件留档，避免下一次写入把现场配置直接覆盖掉。
 * 留档失败不阻塞启动，只记录日志。
 */
const quarantineSettings = async (reason: string): Promise<void> => {
  const target = settingsFile()
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backup = `${target}.corrupt-${stamp}`

  try {
    await rename(target, backup)
    logger.warn('settings', 'settings.quarantined', {
      path: target,
      backup,
      reason,
    })
  } catch (error) {
    logger.error('settings', 'settings.quarantine.failed', {
      path: target,
      reason,
      error,
    })
  }
}

/** 读取配置；文件缺失或损坏时回落到默认值，不让应用起不来 */
export const readSettings = async (): Promise<AppSettings> => {
  let raw: string

  try {
    raw = await readFile(settingsFile(), 'utf-8')
  } catch (error) {
    // 只有“文件不存在”能安全回落默认值。权限/占用等临时错误如果也当成
    // 没配置，接下来的任意写入都会把现场配置覆盖成默认值。
    if ((error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
      return fallbackSettings()
    }

    logger.error('settings', 'settings.read.failed', {
      path: settingsFile(),
      error,
    })

    throw new Error(
      `读取配置文件失败：${(error as Error)?.message ?? '未知错误'}`,
    )
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(raw)
  } catch {
    await quarantineSettings('invalid-json')
    return fallbackSettings()
  }

  if (!isAppSettings(parsed)) {
    // v1 及更早的配置不再兼容：留档后回落默认，现场重新配置
    await quarantineSettings('unsupported-version')
    return fallbackSettings()
  }

  // 版本对不代表形状完整：categories 可能缺失，交给各 normalizer 兜底
  const parsedCategories = (
    parsed as unknown as { categories?: Record<string, unknown> }
  ).categories

  // 显式组装，不再展开 parsed，避免残留的顶层字段被下次写入带回
  return {
    version: SETTINGS_VERSION,
    historyLimit: normalizeHistoryLimit(parsed.historyLimit),
    preferences: normalizePreferences(parsed.preferences),
    categories: {
      el: normalizeEl(parsedCategories?.el),
      lxt: normalizeLxt(parsedCategories?.lxt),
      pl: normalizePl(parsedCategories?.pl),
      aoi: normalizeAoi(parsedCategories?.aoi),
    },
    // 运行期字段，不落盘，每次读的时候按当前环境算
    envOverrides: envOverriddenKeys(),
  }
}

/** 原子写：先写临时文件再 rename，避免断电留下半截 JSON */
const writeSettings = async (settings: AppSettings): Promise<void> => {
  const target = settingsFile()
  // 并发写时固定的 .tmp 会互相截断；唯一后缀保证每次写入各用各的临时文件
  const temp = `${target}.${process.pid}.${randomUUID()}.tmp`
  // envOverrides 是运行时算出来的，写进文件没有意义
  const { envOverrides: _runtime, ...persisted } = settings
  const body = JSON.stringify(persisted, null, 2)

  await writeFile(temp, body, 'utf-8')
  await rename(temp, target)
  logger.debug('settings', 'settings.write', {
    path: target,
    bytes: body.length,
  })
}

/**
 * 清理上次进程被强杀时留下的 settings.json.*.tmp。
 *
 * 正常写入会 rename 掉临时文件；只有写盘途中进程消失才会残留。
 * 只在启动时清一次，避免和正在进行的写入抢同一个临时文件。
 */
export const cleanupSettingsTempFiles = async (): Promise<void> => {
  const target = settingsFile()
  const dir = dirname(target)
  const prefix = `${basename(target)}.`

  try {
    const names = await readdir(dir)
    await Promise.all(
      names
        .filter((name) => name.startsWith(prefix) && name.endsWith('.tmp'))
        .map((name) => rm(join(dir, name), { force: true })),
    )
  } catch (error) {
    // 清理失败不影响启动，下次启动再试
    console.error('清理设置临时文件失败:', error)
    logger.error('settings', 'cleanup-temp.failed', { error })
  }
}

/**
 * 设置文件的读改写串行队列。
 *
 * 所有 mutator 都是「读全量 → 改 → 写全量」，并发时后写会覆盖先写
 * （扫描时多台机台同时回写探测结果就会丢缓存）。只在 writeSettings
 * 外面排队不够，必须把读、改、写整体串起来。
 */
let settingsQueue: Promise<unknown> = Promise.resolve()

const withSettingsLock = <T>(task: () => Promise<T>): Promise<T> => {
  const run = settingsQueue.then(task, task)
  settingsQueue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

/**
 * 在串行队列里完成一次读改写。
 *
 * mutator 内不能再调用其他导出 mutator 或 readSettings —— 锁不可重入。
 * 返回同一个对象表示无需落盘（remember 的「值没变」分支依赖这一点）。
 */
const updateSettings = (
  mutate: (current: AppSettings) => AppSettings | Promise<AppSettings>,
): Promise<AppSettings> =>
  withSettingsLock(async () => {
    const current = await readSettings()
    const next = await mutate(current)

    if (next !== current) await writeSettings(next)

    return next
  })

/** 设置根目录：校验通过后立即识别机台并落盘，失败时不写坏数据 */
export const saveRootPath = async (rootPath: string): Promise<AppSettings> => {
  const trimmed = rootPath.trim()

  if (!trimmed) {
    throw new Error('根目录不能为空，请输入或选择 DC 目录')
  }

  // 目录识别很慢，放在锁外；写回时再基于最新的 current 合并
  const machines = await discoverMachines(trimmed)

  return updateSettings((current) => ({
    ...current,
    categories: {
      ...current.categories,
      el: {
        ...current.categories.el,
        entryRoot: trimmed,
        machines,
        updatedAt: new Date().toISOString(),
      },
    },
  }))
}

/** 重新识别机台；未配置根目录时直接返回当前配置 */
export const refreshMachines = (): Promise<AppSettings> =>
  updateSettings(async (current) => {
    const rootPath = current.categories.el.entryRoot

    if (!rootPath) return current

    // 低频人工操作，锁住一次网络列目录可接受；避免识别期间被别的写覆盖
    const machines = await discoverMachines(rootPath)

    return {
      ...current,
      categories: {
        ...current.categories,
        el: {
          ...current.categories.el,
          machines,
          updatedAt: new Date().toISOString(),
        },
      },
    }
  })

/** 调整历史保留条数并立即裁剪，超出的旧记录直接删掉 */
export const saveHistoryLimit = (limit: number): Promise<AppSettings> =>
  updateSettings((current) => ({
    ...current,
    historyLimit: normalizeHistoryLimit(limit),
  }))

/** 局部更新偏好：只覆盖传进来的字段，其余保持原值 */
export const savePreferences = async (
  patch: Partial<AppPreferences>,
): Promise<AppSettings> => {
  let wasLogEnabled = false

  const next = await updateSettings((current) => {
    wasLogEnabled = current.preferences.debugLogEnabled

    return {
      ...current,
      preferences: normalizePreferences({
        ...current.preferences,
        ...patch,
      }),
    }
  })

  const logEnabled = next.preferences.debugLogEnabled

  // 落盘成功后再切日志，和界面失败回滚保持一致
  if (logEnabled !== wasLogEnabled) {
    if (logEnabled) {
      logger.setEnabled(true)
      logger.info('settings', 'debug-log.changed', {
        enabled: true,
        source: 'settings-page',
      })
    } else {
      logger.info('settings', 'debug-log.changed', {
        enabled: false,
        source: 'settings-page',
      })
      logger.setEnabled(false)
    }
  }

  return next
}

/** 在锁内基于最新配置修改力禧特那一段 */
export const updateLxt = (
  mutate: (lxt: LxtSettings) => LxtSettings,
): Promise<AppSettings> =>
  updateSettings((current) => ({
    ...current,
    categories: {
      ...current.categories,
      lxt: normalizeLxt(mutate(current.categories.lxt)),
    },
  }))

/**
 * 回写单台机台探测到的共享名。
 *
 * `share` 为 null 表示还没探到结论（读不通/未认证），下次扫描会再试；
 * 空串表示探过且两边都没有。写失败只记日志 —— 探测缓存丢失只是下次多探一次，
 * 不该让正在跑的扫描失败。
 */
export const rememberLxtShare = async (
  key: string,
  share: ShareState<LxtShare>,
  host: string,
): Promise<void> => {
  try {
    await updateSettings((current) => {
      const lxt = current.categories.lxt
      const index = lxt.machines.findIndex((item) => item.key === key)

      if (index < 0) return current

      const machine = lxt.machines[index]

      // 期间入口被重新识别、IP 变了，这次探测结果已经过期，不能写回去
      if (machine.host !== host || machine.share === share) return current

      const machines = [...lxt.machines]
      machines[index] = { ...machine, share }

      return {
        ...current,
        categories: {
          ...current.categories,
          lxt: normalizeLxt({ ...lxt, machines }),
        },
      }
    })
  } catch (error) {
    console.error('保存共享名探测结果失败:', error)
    logger.error('settings', 'lxt-share.persist.failed', { key, host, error })
  }
}

/** 在锁内基于最新配置修改利珀那一段 */
export const updatePl = (
  mutate: (pl: PlSettings) => PlSettings,
): Promise<AppSettings> =>
  updateSettings((current) => ({
    ...current,
    categories: {
      ...current.categories,
      pl: normalizePl(mutate(current.categories.pl)),
    },
  }))

/** 在锁内基于最新配置修改森标 AOI 那一段 */
export const updateAoi = (
  mutate: (aoi: AoiSettings) => AoiSettings,
): Promise<AppSettings> =>
  updateSettings((current) => ({
    ...current,
    categories: {
      ...current.categories,
      aoi: normalizeAoi(mutate(current.categories.aoi)),
    },
  }))

/**
 * 回写单台利珀机台探测到的标识目录。
 *
 * `share` 为 null 表示还没探到结论（读不通/未认证），下次扫描会再试；
 * 空串表示探过且没有匹配的标识目录。写失败只记日志，探测缓存丢失只是
 * 下次多探一次，不该让正在跑的扫描失败。
 */
export const rememberPlShare = async (
  key: string,
  share: ShareState,
  host: string,
): Promise<void> => {
  try {
    await updateSettings((current) => {
      const pl = current.categories.pl
      const index = pl.machines.findIndex((item) => item.key === key)

      if (index < 0) return current

      const machine = pl.machines[index]

      // 期间入口被重新识别、IP 变了，这次探测结果已经过期，不能写回去
      if (machine.host !== host || machine.share === share) return current

      const machines = [...pl.machines]
      machines[index] = { ...machine, share }

      return {
        ...current,
        categories: {
          ...current.categories,
          pl: normalizePl({ ...pl, machines }),
        },
      }
    })
  } catch (error) {
    console.error('保存利珀标识目录探测结果失败:', error)
    logger.error('settings', 'pl-share.persist.failed', { key, host, error })
  }
}

/**
 * 覆盖某类扫描的可选不良清单。
 *
 * 清单只影响筛选面板，扫描参数仍随 IPC 传递；仍然是「读全量 → 改 → 写全量」，
 * 与其它 mutator 一样排在串行队列里。
 */
export const saveTypeCatalog = (
  category: ScanCategory,
  types: string[],
): Promise<AppSettings> =>
  updateSettings((current) => {
    const typeCatalog = normalizeTypeCatalog(types)

    // 四个类别的 machine 类型不同，计算键会把 categories 收窄成联合；
    // 这里按整体结构写回，值本身已由各自的 normalizer 保证过
    const categories = {
      ...current.categories,
      [category]: { ...current.categories[category], typeCatalog },
    } as AppSettings['categories']

    return { ...current, categories }
  })
