import { BrowserWindow } from 'electron'

import type { ScanTask, ScanTaskParams } from '../../shared/ipc'

import { ScanTaskRunner } from './task'
import type { TaskContext } from './task'

/** 内存中保留的任务上限，超出时淘汰最早的已结束任务 */
const MAX_TASKS = 20

const tasks = new Map<string, ScanTaskRunner>()

/** 任务快照推送到所有窗口；多窗口打开时进度保持一致 */
const broadcast = (task: ScanTask): void => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('scan:task-update', task)
    }
  }
}

const isFinished = (status: string): boolean =>
  status === 'completed' || status === 'canceled' || status === 'failed'

/** 清理超额的历史任务，只淘汰已结束的，运行中的任务永远保留 */
const evict = (): void => {
  if (tasks.size <= MAX_TASKS) return

  const finished = [...tasks.values()]
    .filter((runner) => isFinished(runner.getStatus()))
    .sort((a, b) => a.createdAt - b.createdAt)

  for (const runner of finished) {
    if (tasks.size <= MAX_TASKS) break
    tasks.delete(runner.id)
  }
}

export const createTask = (
  params: ScanTaskParams,
  context: TaskContext,
): ScanTask => {
  const runner = new ScanTaskRunner(params, context, broadcast)

  tasks.set(runner.id, runner)
  evict()

  // 创建瞬间就推送一次，前端进度条立即进入 0% 的待开始状态
  const snapshot = runner.snapshot()
  broadcast(snapshot)

  return snapshot
}

export const getTask = (id: string): ScanTask | null =>
  tasks.get(id)?.snapshot() ?? null

export const getRunner = (id: string): ScanTaskRunner | null =>
  tasks.get(id) ?? null

export const listTasks = (): ScanTask[] =>
  [...tasks.values()]
    .map((runner) => runner.snapshot())
    .sort((a, b) => b.createdAt - a.createdAt)
