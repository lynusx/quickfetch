import { BrowserWindow, app, dialog, ipcMain, shell } from 'electron'
import { basename } from 'node:path'

import type {
  AoiSetupResult,
  AppPreferences,
  AppSettings,
  DirectoryInfo,
  LxtSetupResult,
  PlSetupResult,
} from '../../shared/ipc'
import {
  discoverAoi,
  discoverLxt,
  discoverPl,
  mergeAoiMachines,
  mergeLxtMachines,
  mergePlMachines,
} from '../services/discovery'
import { probeLxtShare, probePlShare } from '../services/scanner/resolver'
import {
  readSettings,
  refreshMachines,
  rememberLxtShare,
  rememberPlShare,
  savePreferences,
  saveRootPath,
  updateAoi,
  updateLxt,
  updatePl,
} from '../services/settings'
import { splitMachine } from '../services/discovery/shortcuts'
import { toFsPath } from '../utils/pathx'

export const getParentWindow = (
  sender: Electron.WebContents,
): BrowserWindow | undefined =>
  BrowserWindow.fromWebContents(sender) ?? undefined

const setupLxt = async (entryRoot: string): Promise<LxtSetupResult> => {
  // 识别在锁外跑，合并放到锁内，基于最新配置进行
  const { machines: discovered, skipped } = await discoverLxt(entryRoot)
  let added = 0
  let removed = 0
  let relocated = 0

  const settings = await updateLxt((lxt) => {
    const merged = mergeLxtMachines(lxt.machines, discovered)
    added = merged.added
    removed = merged.removed
    relocated = merged.relocated

    return {
      entryRoot,
      machines: merged.machines,
      skipped,
      updatedAt: new Date().toISOString(),
    }
  })

  return {
    settings,
    added,
    removed,
    relocated,
  }
}

const setupPl = async (entryRoot: string): Promise<PlSetupResult> => {
  // 识别在锁外跑，合并放到锁内，基于最新配置进行
  const { machines: discovered, skipped } = await discoverPl(entryRoot)
  let added = 0
  let removed = 0
  let relocated = 0

  const settings = await updatePl((pl) => {
    const merged = mergePlMachines(pl.machines, discovered)
    added = merged.added
    removed = merged.removed
    relocated = merged.relocated

    return {
      entryRoot,
      machines: merged.machines,
      skipped,
      updatedAt: new Date().toISOString(),
    }
  })

  return {
    settings,
    added,
    removed,
    relocated,
  }
}

const setupAoi = async (entryRoot: string): Promise<AoiSetupResult> => {
  // 识别在锁外跑，合并放到锁内，基于最新配置进行
  const { machines: discovered, skipped } = await discoverAoi(entryRoot)
  let added = 0
  let removed = 0
  let relocated = 0

  const settings = await updateAoi((aoi) => {
    const merged = mergeAoiMachines(aoi.machines, discovered)
    added = merged.added
    removed = merged.removed
    relocated = merged.relocated

    return {
      entryRoot,
      machines: merged.machines,
      skipped,
      updatedAt: new Date().toISOString(),
    }
  })

  return {
    settings,
    added,
    removed,
    relocated,
  }
}

export const registerSettingsIpc = (): void => {
  ipcMain.handle('app:version', () => app.getVersion())

  ipcMain.handle(
    'fs:pick-directory',
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

  ipcMain.handle('settings:read', () => readSettings())

  ipcMain.handle('settings:save-root', (_event, rootPath: string) =>
    saveRootPath(rootPath),
  )

  ipcMain.handle('settings:refresh', () => refreshMachines())

  ipcMain.handle(
    'settings:save-preferences',
    (_event, patch: Partial<AppPreferences>) => savePreferences(patch),
  )

  ipcMain.handle('lxt:setup-root', (_event, entryRoot: string) =>
    setupLxt(entryRoot.trim()),
  )

  ipcMain.handle('lxt:refresh', async () => {
    const current = await readSettings()

    if (!current.lxt.entryRoot) {
      throw new Error('尚未配置力禧特EL入口目录，请先选择入口')
    }

    return setupLxt(current.lxt.entryRoot)
  })

  ipcMain.handle('pl:setup-root', (_event, entryRoot: string) =>
    setupPl(entryRoot.trim()),
  )

  ipcMain.handle('pl:refresh', async () => {
    const current = await readSettings()

    if (!current.pl.entryRoot) {
      throw new Error('尚未配置利珀PL入口目录，请先选择入口')
    }

    return setupPl(current.pl.entryRoot)
  })

  ipcMain.handle('aoi:setup-root', (_event, entryRoot: string) =>
    setupAoi(entryRoot.trim()),
  )

  ipcMain.handle('aoi:refresh', async () => {
    const current = await readSettings()

    if (!current.aoi.entryRoot) {
      throw new Error('尚未配置森标 AOI 入口目录，请先选择入口')
    }

    return setupAoi(current.aoi.entryRoot)
  })

  /**
   * 用资源管理器打开网络地址。
   *
   * 未认证时这一步是唯一可靠的办法：Windows 会在打开时弹凭据框，
   * 用户输入一次并勾上「记住我的凭据」之后，本应用后续扫描就能直接读。
   * 应用不代填密码 —— 那要明文保管凭据，风险远大于省下的几次输入。
   */
  ipcMain.handle(
    'share:open',
    async (_event, path: string): Promise<string | null> => {
      const target = (path ?? '').trim()

      if (!target) return '共享地址为空'

      // openPath 失败时返回错误文案，成功返回空串
      const result = await shell.openPath(toFsPath(target))

      return result || null
    },
  )

  /**
   * 强制重新探测共享目录并写回配置。
   *
   * 现场换了共享名、或者当初没连网导致没探到，都靠这个按钮补救。
   * 默认只探"未探测"和"无共享"的机台；显式传 keys 时按 keys 来。
   * 串行 + 分批：46 台并发探会把现场那台 8G 机器和无线网一起拖垮。
   */
  ipcMain.handle(
    'share:reprobe',
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

      if (category === 'lxt') {
        const targets = settings.lxt.machines.filter(
          (item) => !item.stale && (keys ? keys.includes(item.key) : true),
        )

        for (const machine of targets) {
          const share = await probeLxtShare(machine.host, date)

          // null 也要写回：那正是"探过了，两边都没有"的结论
          await rememberLxtShare(machine.key, share, machine.host)
        }

        return readSettings()
      }

      const targets = settings.pl.machines.filter(
        (item) => !item.stale && (keys ? keys.includes(item.key) : true),
      )

      for (const machine of targets) {
        const [plant, name] = splitMachine(machine.key)
        const share = await probePlShare(machine.host, name, plant, date)

        await rememberPlShare(machine.key, share, machine.host)
      }

      return readSettings()
    },
  )
}
