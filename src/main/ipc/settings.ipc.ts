import { BrowserWindow, app, dialog } from 'electron'
import { basename } from 'node:path'

import type {
  AppPreferences,
  DirectoryInfo,
  ScanCategory,
} from '../../shared/ipc'
import {
  readSettings,
  refreshEntryMachines,
  reprobeCategoryShares,
  savePreferences,
  saveTypeCatalog,
  settingsFilePath,
  setupEntryRoot,
} from '../services/settings'
import { handle } from './handle'

export const getParentWindow = (
  sender: Electron.WebContents,
): BrowserWindow | undefined =>
  BrowserWindow.fromWebContents(sender) ?? undefined

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

  handle('getSettingsPath', () => settingsFilePath())

  handle(
    'setupEntryRoot',
    (_event, category: ScanCategory, entryRoot: string) =>
      setupEntryRoot(category, entryRoot),
  )

  handle('refreshEntryMachines', (_event, category: ScanCategory) =>
    refreshEntryMachines(category),
  )

  handle('savePreferences', (_event, patch: Partial<AppPreferences>) =>
    savePreferences(patch),
  )

  handle('setTypeCatalog', (_event, category: ScanCategory, types: string[]) =>
    saveTypeCatalog(category, types),
  )

  handle('reprobeShares', (_event, category: 'lxt' | 'pl', keys?: string[]) =>
    reprobeCategoryShares(category, keys),
  )
}
