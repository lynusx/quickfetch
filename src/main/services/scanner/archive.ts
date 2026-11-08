import type {
  ScanHistoryItem,
  ScanTask,
  ScannedImage,
} from '../../../shared/ipc'

import { logger } from '../log'
import { createHistoryStore, toTask } from './history'
import type { HistoryStore } from './history'

/**
 * 扫描结果的归档 seam。
 *
 * 以前「这轮跑完没有 / 落盘没有 / 图从哪取」由 registry、history、
 * images 三个 module 各判一次：registry 维护 persisted 集合再调
 * saveRecord，history 自己判资格，images 又单独决定读内存还是读记录。
 * 这里把资格、幂等、裁剪、摘要 sidecar 与 live-vs-archived 查找收进
 * 一个 interface；registry 只负责在任务落定时调 settle()。
 *
 * 目录、保留条数与 live 查询都由调用方注入，测试不需要 Electron，
 * 也不需要真实的设置文件。
 */

export interface ArchiveLiveTasks {
  /** 内存里还在的任务快照；没有返回 null */
  task: (id: string) => ScanTask | null
  /** 内存里还在的图片；没有 live runner 时返回 null（空数组是有效结果） */
  images: (id: string) => ScannedImage[] | null
}

export interface TaskArchiveOptions {
  dir: string
  live: ArchiveLiveTasks
  /** 落盘后按这个条数裁剪 */
  limit: () => Promise<number>
}

export interface TaskImagePage {
  images: ScannedImage[]
  total: number
}

export interface TaskArchive {
  /** 落盘一次；未到终态、没有可存内容或已经写过时返回 false */
  settle: (
    task: ScanTask,
    images: ScannedImage[],
    options?: { interrupted?: boolean },
  ) => Promise<boolean>
  trim: (limit: number) => Promise<void>
  list: () => Promise<ScanHistoryItem[]>
  /** 活的任务优先；已结束的从历史记录还原 */
  load: (id: string) => Promise<ScanTask | null>
  images: (id: string) => Promise<ScannedImage[]>
  imagePage: (
    id: string,
    offset: number,
    limit: number,
  ) => Promise<TaskImagePage>
  remove: (id: string) => Promise<void>
  clear: () => Promise<void>
}

/**
 * 已经正常落盘的任务 id。
 *
 * 只用来挡住重复落盘，不承担业务判定；上限足够覆盖任务表（20）与
 * 退出前抢救的并发量，超出后淘汰最早的一条。
 */
const SETTLED_MEMORY = 200

export const createTaskArchive = ({
  dir,
  live,
  limit,
}: TaskArchiveOptions): TaskArchive => {
  const store: HistoryStore = createHistoryStore(dir)
  const settled = new Set<string>()
  const writing = new Set<string>()

  const remember = (taskId: string): void => {
    settled.add(taskId)

    if (settled.size <= SETTLED_MEMORY) return

    const oldest = settled.values().next().value
    if (oldest) settled.delete(oldest)
  }

  const settle = async (
    task: ScanTask,
    images: ScannedImage[],
    options?: { interrupted?: boolean },
  ): Promise<boolean> => {
    if (settled.has(task.id) || writing.has(task.id)) return false

    writing.add(task.id)
    const startedAt = Date.now()

    try {
      logger.info('history', 'history.persist.start', {
        taskId: task.id,
        status: task.status,
        images: images.length,
      })

      const wrote = await store.saveRecord(task, images, options)

      if (!wrote) return false

      // 中断快照只是「关软件时抢救」，任务如果还来得及跑完，
      // 正常终态要能覆盖同一条记录，所以只有终态才记入 settled
      if (options?.interrupted !== true) remember(task.id)

      const keep = await limit().catch(() => null)

      if (keep !== null) await store.trimRecords(keep).catch(() => undefined)

      logger.info('history', 'history.persist.done', {
        taskId: task.id,
        elapsedMs: Date.now() - startedAt,
        historyLimit: keep ?? -1,
      })

      return true
    } catch (error) {
      console.error('保存扫描历史失败:', error)
      logger.error('history', 'history.persist.failed', {
        taskId: task.id,
        error,
      })
      return false
    } finally {
      writing.delete(task.id)
    }
  }

  const imagesOf = async (taskId: string): Promise<ScannedImage[]> => {
    const liveImages = live.images(taskId)

    if (liveImages) return liveImages

    return (await store.readRecord(taskId))?.images ?? []
  }

  return {
    settle,
    trim: (keep) => store.trimRecords(keep),
    list: () => store.listHistory(),
    load: async (id) => {
      const liveTask = live.task(id)
      if (liveTask) return liveTask

      const record = await store.readRecord(id)
      return record ? toTask(record) : null
    },
    images: imagesOf,
    imagePage: async (id, offset, pageSize) => {
      const all = await imagesOf(id)

      return {
        images: all.slice(offset, offset + pageSize),
        total: all.length,
      }
    },
    remove: (id) => store.deleteRecord(id),
    clear: () => store.clearRecords(),
  }
}
