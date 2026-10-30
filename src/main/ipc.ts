import { BrowserWindow, app, dialog, ipcMain } from 'electron'
import { writeFile } from 'node:fs/promises'
import { basename } from 'node:path'

import { copyImagesTo } from './copy'
import { createTask, getRunner, getTask } from './scanner'
import { readSettings, refreshMachines, saveRootPath } from './settings'

import type {
  CopyImagesResult,
  DirectoryInfo,
  ScanTask,
  ScanTaskParams,
} from '../shared/ipc'

const getParentWindow = (
  sender: Electron.WebContents,
): BrowserWindow | undefined =>
  BrowserWindow.fromWebContents(sender) ?? undefined

const requireRunner = (taskId: string) => {
  const runner = getRunner(taskId)

  if (!runner) {
    throw new Error('任务不存在或已被清理，请重新创建扫描任务')
  }

  return runner
}

const validateParams = (params: ScanTaskParams): void => {
  if (!params.machines.length) {
    throw new Error('请至少选择一个机台')
  }
  if (!/^\d{8}$/.test(params.date)) {
    throw new Error('日期格式不正确，应为 YYYYMMDD')
  }
  if (!params.slots.length) {
    throw new Error('请至少选择一个时段')
  }
  if (!params.types.length) {
    throw new Error('请至少选择一个不良类型')
  }
}

export const registerIpcHandlers = (): void => {
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

  // ------------------------------------------------------------------ 配置

  ipcMain.handle('settings:read', () => readSettings())

  ipcMain.handle('settings:save-root', (_event, rootPath: string) =>
    saveRootPath(rootPath),
  )

  ipcMain.handle('settings:refresh', () => refreshMachines())

  // ------------------------------------------------------------------ 扫描

  ipcMain.handle(
    'scan:create',
    async (_event, params: ScanTaskParams): Promise<ScanTask> => {
      const settings = await readSettings()

      if (!settings.rootPath) {
        throw new Error('尚未配置 DC 根目录，请先填写或选择根目录路径')
      }

      validateParams(params)

      const known = new Set(settings.machines.map((item) => item.name))
      const machines = params.machines.filter((name) => known.has(name))

      if (!machines.length) {
        throw new Error('所选机台已不存在，请点击「重新识别」刷新机台列表')
      }

      return createTask(
        { ...params, machines },
        { rootPath: settings.rootPath, entry: settings.entry },
      )
    },
  )

  ipcMain.handle('scan:start', (_event, taskId: string) =>
    requireRunner(taskId).start(),
  )

  ipcMain.handle('scan:pause', (_event, taskId: string) =>
    requireRunner(taskId).pause('user'),
  )

  ipcMain.handle('scan:resume', (_event, taskId: string) =>
    requireRunner(taskId).resume(),
  )

  ipcMain.handle('scan:cancel', (_event, taskId: string) =>
    requireRunner(taskId).cancel(),
  )

  ipcMain.handle('scan:get', (_event, taskId: string) => getTask(taskId))

  ipcMain.handle(
    'scan:images',
    (_event, taskId: string, offset: number, limit: number) => {
      const runner = getRunner(taskId)

      if (!runner) return { images: [], total: 0 }

      const all = runner.getImages()

      return {
        images: all.slice(offset, offset + limit),
        total: all.length,
      }
    },
  )

  // ------------------------------------------------------------------ 复制

  ipcMain.handle(
    'copy:task',
    async (
      event,
      taskId: string,
      targetDir: string,
    ): Promise<CopyImagesResult> => {
      const runner = requireRunner(taskId)
      const sender = event.sender

      const result = await copyImagesTo(runner.getImages(), targetDir, {
        onProgress: (progress) => {
          if (!sender.isDestroyed()) {
            sender.send('fs:copy-progress', progress)
          }
        },
      })

      return result
    },
  )

  // ------------------------------------------------------------------ 其它

  ipcMain.handle(
    'fs:save-excel',
    async (
      event,
      params: { defaultName: string; data: Uint8Array },
    ): Promise<string | null> => {
      const parent = getParentWindow(event.sender)
      const saveOptions = {
        title: '导出 Excel',
        defaultPath: params.defaultName,
        filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }],
      }

      const result = parent
        ? await dialog.showSaveDialog(parent, saveOptions)
        : await dialog.showSaveDialog(saveOptions)

      if (result.canceled || !result.filePath) return null

      await writeFile(result.filePath, Buffer.from(params.data))

      return result.filePath
    },
  )
}
