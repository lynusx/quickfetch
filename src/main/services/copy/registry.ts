import { BrowserWindow } from 'electron'

import type { CopyTask } from '../../../shared/ipc'

import { CopyTaskRunner } from './copy'
import type { CopyRunnerOptions } from './copy'
import { logger } from '../log'
import { createTaskTable } from '../../utils/taskTable'
import { notifyActivityChange } from '../../utils/activity'

/** 同时保留的复制任务数。复制任务比扫描任务轻，但也不该无限留着 */
const MAX_COPY_TASKS = 10

const runners = createTaskTable<CopyTaskRunner>({
  max: MAX_COPY_TASKS,
  isFinal: (runner) => runner.isFinal(),
  onEvict: (runner) =>
    logger.debug('copy', 'copy.task.evicted', { copyId: runner.id }),
})

/**
 * 复制任务快照推送。
 *
 * 复制进度是逐文件的，频率远高于扫描（扫描按目录推），
 * 所以直接广播给所有窗口，不做节流 —— runner 内部已经有 120ms 的发送间隔。
 */
const broadcast = (task: CopyTask): void => {
  notifyActivityChange()

  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('copy:task-update', task)
    }
  }
}

export const startCopy = (
  options: Omit<CopyRunnerOptions, 'emit'>,
): CopyTask => {
  const runner = new CopyTaskRunner({ ...options, emit: broadcast })

  runners.add(runner)

  return runner.start()
}

export const getCopyRunner = (id: string): CopyTaskRunner | null =>
  runners.get(id)

export const getCopyTask = (id: string): CopyTask | null =>
  runners.get(id)?.snapshot() ?? null

/**
 * 运行中的复制任务。复制没有退出落盘逻辑，安装会直接打断写文件，
 * 所以 pending / running / paused 一律阻塞安装。
 */
export const hasRunningCopyTasks = (): boolean =>
  runners.values().some((runner) => !runner.isFinal())
