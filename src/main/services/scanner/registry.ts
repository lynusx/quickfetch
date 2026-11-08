import { BrowserWindow, app } from 'electron'
import { join } from 'node:path'

import type {
  ScanTask,
  ScanTaskParams,
  ScanTaskStatus,
} from '../../../shared/ipc'
import { isFinalScanStatus } from '../../../shared/ipc'
import { IPC_EVENTS } from '../../../shared/ipc'
import { normalizeScanCategory } from '../../../shared/scanCategories'

import { DEFAULT_HISTORY_LIMIT } from '../../../shared/historyLimit'
import { readSettings } from '../settings'
import { createTaskArchive } from './archive'
import type { TaskArchive } from './archive'
import { ScanTaskRunner } from './task'
import type { TaskContext } from './task'
import { logger } from '../log'
import { createTaskTable } from '../../utils/taskTable'
import { notifyActivityChange } from '../../utils/activity'

/** 内存中保留的任务上限，超出时淘汰最早的已结束任务 */
const MAX_TASKS = 20

const tasks = createTaskTable<ScanTaskRunner>({
  max: MAX_TASKS,
  isFinal: (runner) => isFinished(runner.getStatus()),
  onEvict: (runner) =>
    logger.debug('scan', 'scan.task.evicted', { taskId: runner.id }),
})

/** 已经触发过落盘的任务由 archive 自己记住，registry 不再维护集合 */

/** 任务快照推送到所有窗口；多窗口打开时进度保持一致 */
const broadcast = (task: ScanTask): void => {
  notifyActivityChange()

  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(IPC_EVENTS.scanTaskUpdate, task)
    }
  }
}

const currentHistoryLimit = async (): Promise<number> =>
  (await readSettings().catch(() => null))?.historyLimit ??
  DEFAULT_HISTORY_LIMIT

const isFinished = (status: ScanTaskStatus): boolean =>
  isFinalScanStatus(status)

let archive: TaskArchive | null = null

/**
 * 扫描结果的归档入口。
 *
 * 延迟到第一次访问才解析 userData，测试与启动早期都不需要 Electron 路径。
 * live 查询由这里注入；archive 不反向 import registry，避免循环依赖。
 */
export const getArchive = (): TaskArchive => {
  archive ??= createTaskArchive({
    dir: join(app.getPath('userData'), 'history'),
    live: {
      task: (id) => tasks.get(id)?.snapshot() ?? null,
      images: (id) => tasks.get(id)?.getImages() ?? null,
    },
    limit: currentHistoryLimit,
  })

  return archive
}

/**
 * 任务结束时把结果写入历史。
 *
 * 资格、幂等与裁剪都在 archive 里；这里只负责等执行体真正收尾。
 * 取消时 runner 会立即返回 canceled，随后异步收尾，落盘必须等 settle。
 */
const persistWhenSettled = async (runner: ScanTaskRunner): Promise<void> => {
  const settled = await runner.waitSettled()

  if (!settled) return

  await getArchive().settle(runner.snapshot(), runner.getImages())
}

export const createTask = (
  params: ScanTaskParams,
  context: TaskContext,
): ScanTask => {
  // 建任务入口是实时路径的唯一归一化点：之后的广播、历史与 store 都读这里
  const normalized: ScanTaskParams = {
    ...params,
    category: normalizeScanCategory(params.category),
  }
  const runner = new ScanTaskRunner(normalized, context, broadcast)

  tasks.add(runner)

  logger.info('scan', 'scan.task.created', {
    taskId: runner.id,
    category: normalized.category,
    machines: normalized.machines.length,
  })

  // 创建瞬间就推送一次，前端进度条立即进入 0% 的待开始状态
  const snapshot = runner.snapshot()
  broadcast(snapshot)

  return snapshot
}

/** 启动任务并挂上落盘逻辑；由 IPC 层调用，保证每轮扫描只落盘一次 */
const isActive = (status: string): boolean =>
  status === 'pending' || status === 'running' || status === 'paused'

/**
 * 运行中的扫描任务。自动更新安装前要等它们结束：
 * running/paused 的任务内存里已经有读到的图片，退出必须走 interrupted 落盘。
 */
export const hasRunningScanTasks = (): boolean =>
  tasks.values().some((runner) => {
    const status = runner.getStatus()

    return status === 'running' || status === 'paused'
  })

/** 已经启动、尚未写完历史的落盘任务；安装前要等它们收尾 */
const persistenceTasks = new Set<Promise<void>>()

const trackPersistence = (promise: Promise<void>): void => {
  persistenceTasks.add(promise)
  void promise.then(
    () => persistenceTasks.delete(promise),
    () => persistenceTasks.delete(promise),
  )
}

/**
 * 等待所有正在收尾的历史写入。
 *
 * 任务刚跑完时 persistWhenSettled 可能还在写盘，安装会直接退出进程；
 * 不等待就会丢最后一条历史。超时后放行，不能为了写盘卡住安装。
 */
export const flushScanPersistence = async (timeoutMs = 3000): Promise<void> => {
  if (persistenceTasks.size === 0) return

  const timeout = new Promise<void>((resolve) => {
    setTimeout(resolve, timeoutMs)
  })

  await Promise.race([Promise.allSettled([...persistenceTasks]), timeout])
}

export const startTask = (id: string): ScanTask | null => {
  const runner = tasks.get(id)

  if (!runner) return null

  // 渲染层已经互斥；主进程再挡一道，未来新增入口也不会同时跑两个任务
  const active = tasks
    .values()
    .find((item) => item !== runner && isActive(item.getStatus()))

  if (active) {
    throw new Error(
      `已有扫描任务在进行（${normalizeScanCategory(
        active.params.category,
      )}），请先完成或取消`,
    )
  }

  const snapshot = runner.start()
  trackPersistence(persistWhenSettled(runner))

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
 * 不写 settled 集合：任务如果还来得及跑完，persistWhenSettled 会
 * 用正常终态覆盖同一条记录，比这里的中途快照更准（archive 只在
 * 终态落盘时记入 settled）。
 */
export const persistUnfinished = async (): Promise<void> => {
  const pending = tasks.values().filter((runner) => {
    const status = runner.getStatus()

    // 待开始的任务一个目录都没读过，存下来只是一条空记录
    return status !== 'pending' && !isFinished(status)
  })

  if (!pending.length) return

  logger.info('history', 'history.persist-unfinished', {
    count: pending.length,
    taskIds: pending.map((runner) => runner.id),
  })

  const target = getArchive()

  for (const runner of pending) {
    await target.settle(runner.snapshot(), runner.getImages(), {
      interrupted: true,
    })
  }
}
