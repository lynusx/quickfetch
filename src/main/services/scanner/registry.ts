import { BrowserWindow } from 'electron'

import type { ScanTask, ScanTaskParams } from '../../../shared/ipc'

import { DEFAULT_HISTORY_LIMIT } from '../../../shared/historyLimit'
import { readSettings } from '../settings'
import { saveRecord, trimRecords } from './history'
import { ScanTaskRunner } from './task'
import type { TaskContext } from './task'
import { logger } from '../log'

/** 内存中保留的任务上限，超出时淘汰最早的已结束任务 */
const MAX_TASKS = 20

const tasks = new Map<string, ScanTaskRunner>()

/** 已经触发过落盘的任务，避免重复写同一个文件 */
const persisted = new Set<string>()

/** 任务快照推送到所有窗口；多窗口打开时进度保持一致 */
const broadcast = (task: ScanTask): void => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('scan:task-update', task)
    }
  }
}

const isFinished = (status: string): boolean =>
  status === 'completed' ||
  status === 'canceled' ||
  status === 'failed' ||
  status === 'interrupted'

/**
 * 任务结束时把结果写入历史。
 *
 * 不放在 runner 里是因为 runner 只关心「怎么扫」，落盘属于任务表职责；
 * 而且取消时 runner 会立即返回 canceled，随后异步收尾，这里在收尾后统一处理。
 */
const persistWhenSettled = async (runner: ScanTaskRunner): Promise<void> => {
  const settled = await runner.waitSettled()

  if (!settled || persisted.has(runner.id)) return

  persisted.add(runner.id)

  try {
    const task = runner.snapshot()

    logger.info('history', 'history.persist.start', {
      taskId: task.id,
      status: task.status,
      images: task.totalImages,
    })

    const startedAt = Date.now()

    await saveRecord(task, runner.getImages())

    const settings = await readSettings()
    await trimRecords(settings.historyLimit ?? DEFAULT_HISTORY_LIMIT)

    logger.info('history', 'history.persist.done', {
      taskId: task.id,
      elapsedMs: Date.now() - startedAt,
      historyLimit: settings.historyLimit,
    })
  } catch (error) {
    console.error('保存扫描历史失败:', error)
    logger.error('history', 'history.persist.failed', {
      taskId: runner.id,
      error,
    })
  }
}

/** 清理超额的历史任务，只淘汰已结束的，运行中的任务永远保留 */
const evict = (): void => {
  if (tasks.size <= MAX_TASKS) return

  const finished = [...tasks.values()]
    .filter((runner) => isFinished(runner.getStatus()))
    .sort((a, b) => a.createdAt - b.createdAt)

  for (const runner of finished) {
    if (tasks.size <= MAX_TASKS) break
    tasks.delete(runner.id)
    logger.debug('scan', 'scan.task.evicted', { taskId: runner.id })
  }
}

export const createTask = (
  params: ScanTaskParams,
  context: TaskContext,
): ScanTask => {
  const runner = new ScanTaskRunner(params, context, broadcast)

  tasks.set(runner.id, runner)
  evict()

  logger.info('scan', 'scan.task.created', {
    taskId: runner.id,
    category: params.category,
    machines: params.machines.length,
  })

  // 创建瞬间就推送一次，前端进度条立即进入 0% 的待开始状态
  const snapshot = runner.snapshot()
  broadcast(snapshot)

  return snapshot
}

/** 启动任务并挂上落盘逻辑；由 IPC 层调用，保证每轮扫描只落盘一次 */
export const startTask = (id: string): ScanTask | null => {
  const runner = tasks.get(id)

  if (!runner) return null

  const snapshot = runner.start()
  void persistWhenSettled(runner)

  return snapshot
}

export const getTask = (id: string): ScanTask | null =>
  tasks.get(id)?.snapshot() ?? null

export const getRunner = (id: string): ScanTaskRunner | null =>
  tasks.get(id) ?? null

/**
 * 退出前抢救还没跑完的任务。
 *
 * 现场扫描动辄几分钟，用户很容易中途关掉软件（下班、断网等），
 * 不救的话这一次的结果等于没发生过 —— 已经读到的几千张图凭空消失。
 * 这里把当前快照按 interrupted 落盘，重启后在历史里能看到「扫到哪儿了」，
 * 参数也一并保留，点一下就能接着扫。
 *
 * 不写 persisted 集合：任务如果还来得及跑完，persistWhenSettled 会
 * 用正常终态覆盖同一条记录，比这里的中途快照更准。
 */
export const persistUnfinished = async (): Promise<void> => {
  const pending = [...tasks.values()].filter((runner) => {
    const status = runner.getStatus()

    // 待开始的任务一个目录都没读过，存下来只是一条空记录
    return status !== 'pending' && !isFinished(status)
  })

  if (!pending.length) return

  logger.info('history', 'history.persist-unfinished', {
    count: pending.length,
    taskIds: pending.map((runner) => runner.id),
  })

  const limit = (await readSettings().catch(() => null))?.historyLimit

  for (const runner of pending) {
    try {
      await saveRecord(runner.snapshot(), runner.getImages(), {
        interrupted: true,
      })
    } catch (error) {
      console.error(`保存中断的扫描任务失败(${runner.id}):`, error)
      logger.error('history', 'history.persist-unfinished.failed', {
        taskId: runner.id,
        error,
      })
    }
  }

  if (limit) await trimRecords(limit).catch(() => undefined)
}
