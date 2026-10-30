import { BrowserWindow } from 'electron'

import type { CopyTask } from '../shared/ipc'

import { CopyTaskRunner } from './copy'
import type { CopyRunnerOptions } from './copy'

/** 同时保留的复制任务数。复制任务比扫描任务轻，但也不该无限留着 */
const MAX_COPY_TASKS = 10

const runners = new Map<string, CopyTaskRunner>()

/**
 * 复制任务快照推送。
 *
 * 复制进度是逐文件的，频率远高于扫描（扫描按目录推），
 * 所以直接广播给所有窗口，不做节流 —— runner 内部已经有 120ms 的发送间隔。
 */
const broadcast = (task: CopyTask): void => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('copy:task-update', task)
    }
  }
}

/** 淘汰最早的已结束任务，运行中/暂停中的永远保留 */
const evict = (): void => {
  if (runners.size <= MAX_COPY_TASKS) return

  const finished = [...runners.values()]
    .filter((runner) => runner.isFinal())
    .sort((a, b) => a.createdAt - b.createdAt)

  for (const runner of finished) {
    if (runners.size <= MAX_COPY_TASKS) break
    runners.delete(runner.id)
  }
}

export const startCopy = (
  options: Omit<CopyRunnerOptions, 'emit'>,
): CopyTask => {
  const runner = new CopyTaskRunner({ ...options, emit: broadcast })

  runners.set(runner.id, runner)
  evict()

  return runner.start()
}

export const getCopyRunner = (id: string): CopyTaskRunner | null =>
  runners.get(id) ?? null

export const getCopyTask = (id: string): CopyTask | null =>
  runners.get(id)?.snapshot() ?? null
