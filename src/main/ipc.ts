import { BrowserWindow, app, dialog, ipcMain, shell } from 'electron'
import { writeFile } from 'node:fs/promises'
import { basename, normalize, resolve } from 'node:path'

import { filterByMachines, planPreview } from './copy'
import { getCopyRunner, startCopy } from './copyRegistry'
import { loadFrom } from './load'
import { toFsPath } from './pathx'
import {
  clearRecords,
  createTask,
  deleteRecord,
  getRunner,
  getTask,
  listHistory,
  readRecord,
  startTask,
  toTask,
  trimRecords,
} from './scanner'
import {
  readSettings,
  refreshMachines,
  saveHistoryLimit,
  savePreferences,
  saveRootPath,
} from './settings'

import type {
  AppPreferences,
  CopyPlanPreview,
  CopyTask,
  CopyTaskParams,
  DirectoryInfo,
  ScanHistoryItem,
  ScanTask,
  ScanTaskParams,
  ScannedImage,
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

  ipcMain.handle(
    'settings:save-preferences',
    (_event, patch: Partial<AppPreferences>) => savePreferences(patch),
  )

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
        {
          rootPath: settings.rootPath,
          entry: settings.entry,
          load: loadFrom(settings.preferences),
        },
      )
    },
  )

  // 启动走 registry.startTask：它在任务结束后负责把结果写入历史
  ipcMain.handle('scan:start', (_event, taskId: string): ScanTask => {
    const task = startTask(taskId)

    if (!task) throw new Error('任务不存在或已过期，请重新开始扫描')

    return task
  })

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
    async (_event, taskId: string, offset: number, limit: number) => {
      // 内存里的任务优先；重启后从历史记录里读
      const runner = getRunner(taskId)

      if (runner) {
        const all = runner.getImages()

        return { images: all.slice(offset, offset + limit), total: all.length }
      }

      const record = await readRecord(taskId)

      if (!record) return { images: [], total: 0 }

      return {
        images: record.images.slice(offset, offset + limit),
        total: record.images.length,
      }
    },
  )

  // ------------------------------------------------------------------ 历史

  ipcMain.handle(
    'history:list',
    (): Promise<ScanHistoryItem[]> => listHistory(),
  )

  ipcMain.handle('history:load', async (_event, taskId: string) => {
    // 当前会话的任务直接取内存快照，历史文件只作为重启后的来源
    const live = getTask(taskId)

    if (live) return live

    const record = await readRecord(taskId)

    return record ? toTask(record) : null
  })

  ipcMain.handle('history:delete', async (_event, taskId: string) => {
    await deleteRecord(taskId)

    return listHistory()
  })

  ipcMain.handle('history:clear', async () => {
    await clearRecords()

    return listHistory()
  })

  ipcMain.handle('history:set-limit', async (_event, limit: number) => {
    const settings = await saveHistoryLimit(limit)

    // 收紧保留条数后立即裁剪，避免用户以为改了设置却还占着磁盘
    await trimRecords(settings.historyLimit)

    return settings
  })

  // ------------------------------------------------------------------ 复制

  /**
   * 取任务的全量图片。内存里的任务优先，重启后恢复的历史任务从结果文件读。
   * 复制与预检查都从这里取，避免两处逻辑走叉。
   */
  const resolveImages = async (taskId: string): Promise<ScannedImage[]> => {
    const runner = getRunner(taskId)

    if (runner) return runner.getImages()

    return (await readRecord(taskId))?.images ?? []
  }

  const requireCopyRunner = (copyId: string) => {
    const runner = getCopyRunner(copyId)

    if (!runner) {
      throw new Error('复制任务不存在或已被清理，请重新开始复制')
    }

    return runner
  }

  ipcMain.handle(
    'copy:preview',
    async (
      _event,
      taskId: string,
      params: CopyTaskParams,
      targetDir?: string,
    ): Promise<CopyPlanPreview> => {
      const images = await resolveImages(taskId)

      if (!images.length) {
        throw new Error('该任务没有可复制的图片，请重新扫描')
      }

      // 选了目录才能算冲突数，没选时只报规模
      const target = targetDir?.trim()
        ? resolve(normalize(targetDir))
        : undefined

      return planPreview(images, params, target)
    },
  )

  ipcMain.handle(
    'copy:start',
    async (
      _event,
      taskId: string,
      targetDir: string,
      params: CopyTaskParams,
    ): Promise<CopyTask> => {
      // 空字符串交给 resolve 会变成当前工作目录，等于把几百张图悄悄倒进安装目录，
      // 所以这一条必须显式拦住
      if (!targetDir || !targetDir.trim()) {
        throw new Error('请先选择复制目标目录')
      }

      const images = await resolveImages(taskId)

      if (!images.length) {
        throw new Error('该任务没有可复制的图片，请重新扫描')
      }

      // 目标目录由渲染层通过 pickDirectory 选好再传进来，
      // 主进程只做一次规范化，避免「结尾斜杠不同」被当成两个目录
      const target = resolve(normalize(targetDir))
      const picked = filterByMachines(images, params.machines)

      if (!picked.length) {
        throw new Error('所选机台在当前任务里没有图片，请重新勾选')
      }

      const profile = loadFrom((await readSettings()).preferences)

      return startCopy({
        scanTaskId: taskId,
        targetDir: target,
        params,
        images,
        load: {
          concurrency: profile.copyConcurrency,
          batchSize: profile.copyBatchSize,
        },
      })
    },
  )

  ipcMain.handle('copy:pause', (_event, copyId: string) =>
    requireCopyRunner(copyId).pause(),
  )

  ipcMain.handle('copy:resume', (_event, copyId: string) =>
    requireCopyRunner(copyId).resume(),
  )

  ipcMain.handle('copy:cancel', (_event, copyId: string) =>
    requireCopyRunner(copyId).cancel(),
  )

  ipcMain.handle('copy:retry', (_event, copyId: string) =>
    requireCopyRunner(copyId).retry(),
  )

  ipcMain.handle(
    'copy:get',
    (_event, copyId: string) => getCopyRunner(copyId)?.snapshot() ?? null,
  )

  ipcMain.handle(
    'copy:to-new-dir',
    (_event, copyId: string, targetDir: string) =>
      requireCopyRunner(copyId).retargetTo(resolve(normalize(targetDir))),
  )

  /** 在系统文件管理器里打开目标目录，复制完成后用户要立刻看到结果 */
  ipcMain.handle(
    'copy:reveal',
    async (_event, targetDir: string): Promise<string | null> => {
      const result = await shell.openPath(toFsPath(targetDir))

      // openPath 失败时返回错误字符串，成功返回空串
      return result ? result : null
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
