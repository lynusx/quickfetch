import { shell } from 'electron'
import { normalize, resolve } from 'node:path'

import type {
  CopyPlanPreview,
  CopyTask,
  CopyTaskParams,
} from '../../shared/ipc'
import { canCopyScanStatus, isFinalScanStatus } from '../../shared/ipc'
import {
  planPreview,
  getActiveCopyForScan,
  getCopyRunner,
  selectCopyImages,
  startCopy,
} from '../services/copy'
import { getArchive } from '../services/scanner'
import { readSettings, loadFrom } from '../services/settings'
import { normalizeScanCategory } from '../../shared/scanCategories'
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
    'previewCopyPlan',
    async (
      _event,
      taskId: string,
      params: CopyTaskParams,
      targetDir?: string,
    ): Promise<CopyPlanPreview> => {
      const images = await getArchive().images(taskId)

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
    'startCopyTask',
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

      const scanTask = await getArchive().load(taskId)

      if (!scanTask) {
        throw new Error('扫描任务不存在或已过期，请重新扫描')
      }

      // 主进程是复制资格的最终口径：渲染层的按钮禁用可以被覆盖确认弹窗等入口绕过
      if (!canCopyScanStatus(scanTask.status)) {
        throw new Error(
          isFinalScanStatus(scanTask.status)
            ? '该扫描任务未正常完成，无法复制'
            : '扫描任务尚未结束，请完成或取消后再复制',
        )
      }

      if (getActiveCopyForScan(taskId)) {
        throw new Error('该扫描任务已有复制任务在进行，请等待完成或取消')
      }

      const images = await getArchive().images(taskId)

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
        // 类别从主进程的扫描快照派生，不信任渲染层传值
        category: normalizeScanCategory(scanTask.params.category),
        load: {
          concurrency: profile.copyConcurrency,
          batchSize: profile.copyBatchSize,
        },
      })
    },
  )

  handle('pauseCopyTask', (_event, copyId: string) =>
    requireCopyRunner(copyId).pause(),
  )

  handle('resumeCopyTask', (_event, copyId: string) =>
    requireCopyRunner(copyId).resume(),
  )

  handle('cancelCopyTask', (_event, copyId: string) =>
    requireCopyRunner(copyId).cancel(),
  )

  handle('retryCopyFailures', (_event, copyId: string) =>
    requireCopyRunner(copyId).retry(),
  )

  handle(
    'getCopyTask',
    (_event, copyId: string) => getCopyRunner(copyId)?.snapshot() ?? null,
  )

  handle(
    'revealCopyTarget',
    async (_event, targetDir: string): Promise<string | null> => {
      const result = await shell.openPath(toFsPath(targetDir))
      return result ? result : null
    },
  )
}
