import type { ScanTask, ScanTaskParams } from '../../shared/ipc'
import {
  createTask,
  getArchive,
  getRunner,
  getTask,
  startTask,
} from '../services/scanner'
import { prepareScanTask } from '../services/scanner/workspace'
import { readSettings } from '../services/settings'
import { handle } from './handle'

const requireRunner = (taskId: string) => {
  const runner = getRunner(taskId)

  if (!runner) {
    throw new Error('任务不存在或已被清理，请重新创建扫描任务')
  }

  return runner
}

export const registerScanIpc = (): void => {
  handle('createScanTask', async (_event, rawParams: ScanTaskParams) => {
    const settings = await readSettings()
    const { params, context } = prepareScanTask(settings, rawParams)

    return createTask(params, context)
  })

  // 启动走 registry.startTask：它在任务结束后负责把结果写入历史
  handle('startScanTask', (_event, taskId: string): ScanTask => {
    const task = startTask(taskId)

    if (!task) throw new Error('任务不存在或已过期，请重新开始扫描')

    return task
  })

  handle('pauseScanTask', (_event, taskId: string) =>
    requireRunner(taskId).pause('user'),
  )

  handle('resumeScanTask', (_event, taskId: string) =>
    requireRunner(taskId).resume(),
  )

  handle('cancelScanTask', (_event, taskId: string) =>
    requireRunner(taskId).cancel(),
  )

  handle('getScanTask', (_event, taskId: string) => getTask(taskId))

  handle(
    'getScanTaskImages',
    (_event, taskId: string, offset: number, limit: number) =>
      getArchive().imagePage(taskId, offset, limit),
  )
}
