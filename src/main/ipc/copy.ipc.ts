import { shell } from 'electron'
import { normalize, resolve } from 'node:path'

import type {
  CopyPlanPreview,
  CopyTask,
  CopyTaskParams,
} from '../../shared/ipc'
import {
  planPreview,
  getCopyRunner,
  selectCopyImages,
  startCopy,
} from '../services/copy'
import { taskImages } from '../services/scanner'
import { readSettings, loadFrom } from '../services/settings'
import { toFsPath } from '../utils/pathx'
import { handle } from './handle'

const requireCopyRunner = (copyId: string) => {
  const runner = getCopyRunner(copyId)

  if (!runner) {
    throw new Error('复制任务不存在或已被清理，请重新开始复制')
  }

  return runner
}

export const registerCopyIpc = (): void => {
  handle(
    'copy:preview',
    async (
      _event,
      taskId: string,
      params: CopyTaskParams,
      targetDir?: string,
    ): Promise<CopyPlanPreview> => {
      const images = await taskImages(taskId)

      if (!images.length) {
        throw new Error('该任务没有可复制的图片，请重新扫描')
      }

      const target = targetDir?.trim()
        ? resolve(normalize(targetDir))
        : undefined

      return planPreview(images, params, target)
    },
  )

  handle(
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

      if (!params.machines.length) {
        throw new Error('请至少勾选一个机台')
      }

      const images = await taskImages(taskId)

      if (!images.length) {
        throw new Error('该任务没有可复制的图片，请重新扫描')
      }

      const target = resolve(normalize(targetDir))
      const picked = selectCopyImages(images, params.machines)

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

  handle('copy:pause', (_event, copyId: string) =>
    requireCopyRunner(copyId).pause(),
  )

  handle('copy:resume', (_event, copyId: string) =>
    requireCopyRunner(copyId).resume(),
  )

  handle('copy:cancel', (_event, copyId: string) =>
    requireCopyRunner(copyId).cancel(),
  )

  handle('copy:retry', (_event, copyId: string) =>
    requireCopyRunner(copyId).retry(),
  )

  handle(
    'copy:get',
    (_event, copyId: string) => getCopyRunner(copyId)?.snapshot() ?? null,
  )

  handle(
    'copy:reveal',
    async (_event, targetDir: string): Promise<string | null> => {
      const result = await shell.openPath(toFsPath(targetDir))
      return result ? result : null
    },
  )
}
