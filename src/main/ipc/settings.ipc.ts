import { BrowserWindow, app, dialog, ipcMain } from 'electron'
import { basename } from 'node:path'

import type {
  AppPreferences,
  DirectoryInfo,
  LxtSetupResult,
  PlSetupResult,
} from '../../shared/ipc'
import {
  discoverLxt,
  discoverPl,
  mergeLxtMachines,
  mergePlMachines,
} from '../services/discovery'
import {
  readSettings,
  refreshMachines,
  savePreferences,
  saveRootPath,
  updateLxt,
  updatePl,
} from '../services/settings'

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
      throw new Error('尚未配置力禧特入口目录，请先选择入口')
    }

    return setupLxt(current.lxt.entryRoot)
  })

  ipcMain.handle('pl:setup-root', (_event, entryRoot: string) =>
    setupPl(entryRoot.trim()),
  )

  ipcMain.handle('pl:refresh', async () => {
    const current = await readSettings()

    if (!current.pl.entryRoot) {
      throw new Error('尚未配置利珀入口目录，请先选择入口')
    }

    return setupPl(current.pl.entryRoot)
  })
}
