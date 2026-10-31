import { ipcMain, shell } from 'electron'
import { normalize, resolve } from 'node:path'

import type {
  CopyPlanPreview,
  CopyTask,
  CopyTaskParams,
  ScannedImage,
} from '../../shared/ipc'
import {
  filterByMachines,
  planPreview,
  getCopyRunner,
  startCopy,
} from '../services/copy'
import { getRunner, readRecord } from '../services/scanner'
import { readSettings, loadFrom } from '../services/settings'
import { toFsPath } from '../utils/pathx'

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

export const registerCopyIpc = (): void => {
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
      if (!targetDir || !targetDir.trim()) {
        throw new Error('请先选择复制目标目录')
      }

      const images = await resolveImages(taskId)

      if (!images.length) {
        throw new Error('该任务没有可复制的图片，请重新扫描')
      }

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

  ipcMain.handle(
    'copy:reveal',
    async (_event, targetDir: string): Promise<string | null> => {
      const result = await shell.openPath(toFsPath(targetDir))
      return result ? result : null
    },
  )
}
