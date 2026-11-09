import { BrowserWindow, app, dialog } from 'electron'
import { basename } from 'node:path'

import type {
  AppPreferences,
  AppSettings,
  CategoryConfig,
  DirectoryInfo,
  EntrySetupResult,
  LxtShare,
  LxtSetupResult,
  ScanCategory,
  ShareState,
} from '../../shared/ipc'
import { ENTRY_DESCRIPTORS } from '../services/discovery/categories'
import type { EntryCategory } from '../services/discovery/categories'
import type {
  DiscoveredLink,
  Discovery,
  MergeResult,
} from '../services/discovery'
import { probeLxtShare, probePlShare } from '../services/scanner/resolver'
import {
  readSettings,
  refreshMachines,
  rememberLxtShare,
  rememberPlShare,
  savePreferences,
  saveRootPath,
  saveTypeCatalog,
} from '../services/settings'
import { applyUpdatePreferences } from '../services/update'
import { splitMachine } from '../services/discovery/shortcuts'
import { handle } from './handle'

export const getParentWindow = (
  sender: Electron.WebContents,
): BrowserWindow | undefined =>
  BrowserWindow.fromWebContents(sender) ?? undefined

interface EntrySetupAdapter<
  TMachine,
  TSettings extends CategoryConfig<TMachine>,
> {
  discover: (entryRoot: string) => Promise<Discovery>
  merge: (
    previous: TMachine[],
    discovered: DiscoveredLink[],
  ) => MergeResult<TMachine>
  update: (mutate: (current: TSettings) => TSettings) => Promise<AppSettings>
}

/**
 * 入口目录识别 + 合并 + 落盘的共同流程。
 *
 * LXT/PL/AOI 的差异只有 discover、merge 与 settings 段落；三者以前
 * 各写一遍同样的 added/removed/relocated 统计与原子更新顺序。
 */
const setupEntry = async <TMachine, TSettings extends CategoryConfig<TMachine>>(
  entryRoot: string,
  adapter: EntrySetupAdapter<TMachine, TSettings>,
): Promise<LxtSetupResult> => {
  // 识别在锁外跑，合并放到锁内，基于最新配置进行
  const discovery = await adapter.discover(entryRoot)
  let added = 0
  let removed = 0
  let relocated = 0

  const settings = await adapter.update((current) => {
    const merged = adapter.merge(current.machines, discovery.machines)
    added = merged.added
    removed = merged.removed
    relocated = merged.relocated

    return {
      ...current,
      entryRoot,
      machines: merged.machines,
      skipped: discovery.skipped,
      updatedAt: new Date().toISOString(),
    }
  })

  return { settings, added, removed, relocated }
}

const setupByCategory = (
  category: EntryCategory,
  entryRoot: string,
): Promise<EntrySetupResult> => {
  switch (category) {
    case 'lxt':
      return setupEntry(entryRoot, ENTRY_DESCRIPTORS.lxt)
    case 'pl':
      return setupEntry(entryRoot, ENTRY_DESCRIPTORS.pl)
    case 'aoi':
      return setupEntry(entryRoot, ENTRY_DESCRIPTORS.aoi)
  }
}

const refreshByCategory = async (
  category: EntryCategory,
): Promise<EntrySetupResult> => {
  const current = await readSettings()
  const config = current.categories[category]

  if (!config.entryRoot) {
    throw new Error(
      `尚未配置${ENTRY_DESCRIPTORS[category].label}入口目录，请先选择入口`,
    )
  }

  return setupByCategory(category, config.entryRoot)
}

interface ReprobeTarget {
  key: string
  host: string
  stale: boolean
}

interface ReprobeStrategy {
  machines: (settings: AppSettings) => ReprobeTarget[]
  probe: (machine: ReprobeTarget, date: string) => Promise<ShareState>
  remember: (key: string, share: ShareState, host: string) => Promise<void>
}

/** 重新探测共享的类别差异：力禧特固定候选，利珀要从复合键拆厂区与线别名 */
const REPROBE_STRATEGIES: Record<'lxt' | 'pl', ReprobeStrategy> = {
  lxt: {
    machines: (settings) => settings.categories.lxt.machines,
    probe: (machine, date) => probeLxtShare(machine.host, date),
    remember: (key, share, host) =>
      rememberLxtShare(key, share as ShareState<LxtShare>, host),
  },
  pl: {
    machines: (settings) => settings.categories.pl.machines,
    probe: (machine, date) => {
      const [plant, name] = splitMachine(machine.key)
      return probePlShare(machine.host, name, plant, date)
    },
    remember: rememberPlShare,
  },
}

export const registerSettingsIpc = (): void => {
  handle('getVersion', () => app.getVersion())

  handle(
    'pickDirectory',
    async (
      event,
      options: { title?: string } = {},
    ): Promise<DirectoryInfo | null> => {
      const parent = getParentWindow(event.sender)
      const windowOptions: Electron.OpenDialogOptions = {
        title: options.title ?? '请选择目录',
        properties: ['openDirectory', 'createDirectory'],
      }

      const result = parent
        ? await dialog.showOpenDialog(parent, windowOptions)
        : await dialog.showOpenDialog(windowOptions)

      if (result.canceled || !result.filePaths.length) return null

      const path = result.filePaths[0]

      return { path, name: basename(path) }
    },
  )

  handle('readSettings', () => readSettings())

  handle('saveRootPath', (_event, rootPath: string) => saveRootPath(rootPath))

  handle('refreshMachines', () => refreshMachines())

  handle('savePreferences', async (_event, patch: Partial<AppPreferences>) => {
    const next = await savePreferences(patch)

    if ('updateAutoCheckEnabled' in patch) {
      applyUpdatePreferences(next.preferences)
    }

    return next
  })

  handle('setTypeCatalog', (_event, category: ScanCategory, types: string[]) =>
    saveTypeCatalog(category, types),
  )

  handle('setupLxtRoot', (_event, entryRoot: string) =>
    setupByCategory('lxt', entryRoot.trim()),
  )

  handle('refreshLxtMachines', () => refreshByCategory('lxt'))

  handle('setupPlRoot', (_event, entryRoot: string) =>
    setupByCategory('pl', entryRoot.trim()),
  )

  handle('refreshPlMachines', () => refreshByCategory('pl'))

  handle('setupAoiRoot', (_event, entryRoot: string) =>
    setupByCategory('aoi', entryRoot.trim()),
  )

  handle('refreshAoiMachines', () => refreshByCategory('aoi'))

  /**
   * 强制重新探测共享目录并写回配置。
   *
   * 现场换了共享名、或者当初没连网导致没探到，都靠这个按钮补救。
   * 不传 keys 时重探全部未删除机台；显式传 keys 时按 keys 来。
   * 串行探测：46 台并发会把现场那台 8G 机器和无线网一起拖垮。
   */
  handle(
    'reprobeShares',
    async (
      _event,
      category: 'lxt' | 'pl',
      keys?: string[],
    ): Promise<AppSettings> => {
      const settings = await readSettings()
      const today = new Date()

      const date = [
        today.getFullYear(),
        String(today.getMonth() + 1).padStart(2, '0'),
        String(today.getDate()).padStart(2, '0'),
      ].join('')

      const strategy = REPROBE_STRATEGIES[category]
      const targets = strategy
        .machines(settings)
        .filter(
          (item) => !item.stale && (keys ? keys.includes(item.key) : true),
        )

      for (const machine of targets) {
        const share = await strategy.probe(machine, date)

        // null 表示读不通、结论不确定，保留旧缓存下次再试；
        // '' 才表示「探过了，两边都没有」，正常落盘
        if (share !== null) {
          await strategy.remember(machine.key, share, machine.host)
        }
      }

      return readSettings()
    },
  )
}
