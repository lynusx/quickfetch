import { BrowserWindow, app, dialog, ipcMain } from 'electron'
import { copyFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

import { scanImages } from './scan'

import type {
  CopyImagesResult,
  CopyProgress,
  DirectoryInfo,
  ScanImagesParams,
  ScanImagesResult,
} from '../../src/types/electron'

/** 单批并发拷贝数，避免大量文件同时打开句柄 */
const COPY_CONCURRENCY = 10

const getParentWindow = (
  sender: Electron.WebContents,
): BrowserWindow | undefined =>
  BrowserWindow.fromWebContents(sender) ?? undefined

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

  ipcMain.handle(
    'fs:scan-images',
    async (
      _event,
      params: Omit<ScanImagesParams, 'rootPath'> & { rootPath: string },
    ): Promise<ScanImagesResult> => scanImages(params),
  )

  ipcMain.handle(
    'fs:copy-images',
    async (
      event,
      params: { files: string[]; targetDir: string },
    ): Promise<CopyImagesResult> => {
      const { files, targetDir } = params
      const total = files.length
      const failed: string[] = []
      let copied = 0

      const report = (): void => {
        const progress: CopyProgress = {
          copied,
          total,
          failed: failed.length,
        }
        if (!event.sender.isDestroyed()) {
          event.sender.send('fs:copy-progress', progress)
        }
      }

      const copyOne = async (file: string): Promise<void> => {
        try {
          await copyFile(file, join(targetDir, basename(file)))
          copied += 1
        } catch (error) {
          // 同名文件被占用、权限不足等，记录后继续
          console.error(`复制文件 ${file} 失败:`, error)
          failed.push(file)
        } finally {
          report()
        }
      }

      for (let i = 0; i < total; i += COPY_CONCURRENCY) {
        await Promise.all(files.slice(i, i + COPY_CONCURRENCY).map(copyOne))
      }

      return { copied, failed }
    },
  )

  ipcMain.handle(
    'fs:write-text-file',
    async (
      _event,
      params: { dir: string; filename: string; lines: string[] },
    ): Promise<void> => {
      const { dir, filename, lines } = params
      await writeFile(join(dir, filename), lines.join('\n'), 'utf-8')
    },
  )

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
