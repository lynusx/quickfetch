import { app } from 'electron'
import { existsSync } from 'node:fs'
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { join } from 'node:path'

import type {
  ScanBranch,
  ScanHistoryItem,
  ScanTask,
  ScanTaskParams,
  ScanTaskStatus,
  ScannedImage,
} from '../../../shared/ipc'
import { isSettledScanStatus } from '../../../shared/ipc'

import {
  normalizeHistoryLimit,
  PREVIEW_LIMIT,
} from '../../../shared/historyLimit'
import { toFsPath } from '../../utils/pathx'

/** 单条历史的结果文件格式版本 */
const RECORD_VERSION = 1

interface HistoryRecord {
  version: typeof RECORD_VERSION
  id: string
  status: ScanTaskStatus
  params: ScanTaskParams
  branches: ScanBranch[]
  /**
   * 全量图片路径，恢复历史与再次复制都靠它。
   * `machine` 是后加的：老记录没有，复制时由 machineOf 回落到 path 第 0 段。
   */
  images: {
    path: string
    absolutePath: string
    name: string
    machine?: string
  }[]
  progress: ScanTask['progress']
  createdAt: number
  startedAt: number | null
  finishedAt: number | null
}

const isRecord = (value: unknown): value is HistoryRecord => {
  if (typeof value !== 'object' || value === null) return false

  const record = value as HistoryRecord

  return (
    record.version === RECORD_VERSION &&
    typeof record.id === 'string' &&
    Array.isArray(record.images) &&
    Array.isArray(record.branches) &&
    typeof record.params === 'object'
  )
}

/** 任务已经跑完的三种终态，其余状态都算「中途」 */
const isSettled = (status: ScanTaskStatus): boolean =>
  isSettledScanStatus(status)

const isHistoryItem = (value: unknown): value is ScanHistoryItem => {
  if (typeof value !== 'object' || value === null) return false

  const item = value as ScanHistoryItem

  return (
    typeof item.id === 'string' &&
    typeof item.params === 'object' &&
    item.params !== null &&
    typeof item.createdAt === 'number'
  )
}

const toItem = (record: HistoryRecord): ScanHistoryItem => ({
  id: record.id,
  status: record.status,
  params: record.params,
  // 既有记录可能没有 category，它们全是 EL 扫出来的，按 el 补齐即可
  category: record.params.category ?? 'el',
  totalImages: record.images.length,
  hitMachines: record.branches.filter((branch) => branch.images > 0).length,
  machineCount: record.branches.length,
  elapsedMs:
    (record.finishedAt ?? record.createdAt) -
    (record.startedAt ?? record.createdAt),
  createdAt: record.createdAt,
  finishedAt: record.finishedAt,
  diagnosed: record.branches.some((branch) => branch.status !== 'skipped'),
  restorable: true,
})

/** 把历史记录还原成任务快照，字段与在线任务一致，前端不必区分两套结构 */
export const toTask = (record: HistoryRecord): ScanTask => ({
  id: record.id,
  status: record.status,
  params: record.params,
  progress: record.progress,
  branches: record.branches,
  pauseReason: null,
  error: null,
  createdAt: record.createdAt,
  startedAt: record.startedAt,
  finishedAt: record.finishedAt,
  totalImages: record.images.length,
  preview: record.images.slice(0, PREVIEW_LIMIT),
  elapsedMs:
    (record.finishedAt ?? record.createdAt) -
    (record.startedAt ?? record.createdAt),
})

export interface HistoryStore {
  saveRecord: (
    task: ScanTask,
    images: ScannedImage[],
    options?: { interrupted?: boolean },
  ) => Promise<void>
  listRecords: () => Promise<HistoryRecord[]>
  listHistory: () => Promise<ScanHistoryItem[]>
  readRecord: (id: string) => Promise<HistoryRecord | null>
  deleteRecord: (id: string) => Promise<void>
  clearRecords: () => Promise<void>
  trimRecords: (limit: number) => Promise<void>
}

/**
 * 历史文件 store。
 *
 * 目录由调用方注入：生产用 userData/history，测试用临时目录。
 * 记录是否值得落盘属于 store 的 policy，registry 只负责调用。
 */
export const createHistoryStore = (dir: string): HistoryStore => {
  const recordPath = (id: string): string => join(dir, `${id}.json`)
  const summaryPath = (id: string): string => `${recordPath(id)}.summary.json`

  const ensureDir = async (): Promise<void> => {
    await mkdir(dir, { recursive: true })
  }

  const readSummary = async (id: string): Promise<ScanHistoryItem | null> => {
    try {
      const raw = await readFile(toFsPath(summaryPath(id)), 'utf-8')
      const parsed: unknown = JSON.parse(raw)

      return isHistoryItem(parsed) ? parsed : null
    } catch {
      return null
    }
  }

  /**
   * 清掉写完/清理后残留的 tmp。只删超过一小时的：列表可能在另一次
   * 写入进行中调用，不能把正在 rename 的临时文件抢走。
   */
  const cleanupStaleTemps = async (): Promise<void> => {
    let names: string[]

    try {
      names = await readdir(toFsPath(dir))
    } catch {
      return
    }

    const cutoff = Date.now() - 60 * 60 * 1000

    await Promise.all(
      names
        .filter((name) => name.endsWith('.tmp'))
        .map(async (name) => {
          const full = join(dir, name)

          try {
            const info = await stat(toFsPath(full))

            if (info.mtimeMs < cutoff) await rm(toFsPath(full), { force: true })
          } catch {
            // 已被别的进程/清理流程删掉
          }
        }),
    )
  }

  const saveRecord = async (
    task: ScanTask,
    images: ScannedImage[],
    options?: { interrupted?: boolean },
  ): Promise<void> => {
    const interrupted = options?.interrupted === true && !isSettled(task.status)

    if (!interrupted) {
      if (task.status === 'pending' || task.status === 'running') return
      if (task.status === 'paused') return
    }

    // 「有诊断」只认真正读过目录的分支：断链会给 missing/unreachable，
    // 读到了内容会给 empty/hit。仍是 skipped 说明这个机台根本没轮到，
    // 不能算作有效结论，否则取消瞬间的空任务也会被当成有信息存下来。
    const diagnosed = task.branches.some(
      (branch) => branch.status !== 'skipped',
    )

    if (!images.length && !diagnosed && !interrupted) return

    const record: HistoryRecord = {
      version: RECORD_VERSION,
      id: task.id,
      status: interrupted ? 'interrupted' : task.status,
      params: task.params,
      branches: task.branches,
      // 必须存全量：历史任务的再次复制要能读到每一张图，
      // 只存预览的话恢复出来的任务会把 200 条之后的结果静默丢掉
      // machine 必须一起存：力禧特/利珀的 path 第 0 段是厂区，
      // 复制时按机台筛选只能靠这个字段，丢了就会筛空
      images: images.map((image) => ({
        path: image.path,
        absolutePath: image.absolutePath,
        name: image.name,
        machine: image.machine,
      })),
      progress: task.progress,
      createdAt: task.createdAt,
      startedAt: task.startedAt,
      // 中断的任务没有结束时间，用落盘这一刻补齐：
      // 恢复后的「耗时」显示的是从开跑到关软件实际花了多久
      finishedAt: task.finishedAt ?? (interrupted ? Date.now() : null),
    }

    await ensureDir()

    const target = recordPath(record.id)
    const temp = `${target}.${process.pid}.${Date.now()}.tmp`

    // 原子写：扫描完成时系统可能正在休眠或断电，半截 JSON 会毁掉整条历史
    await writeFile(toFsPath(temp), JSON.stringify(record), 'utf-8')
    await rename(toFsPath(temp), toFsPath(target))

    // 摘要 sidecar 供历史列表使用，避免为了列表把全量图片路径读进内存。
    // 写失败不影响主记录：列表会回落到完整 JSON。
    try {
      const summary = summaryPath(record.id)
      const summaryTemp = `${summary}.${process.pid}.tmp`

      await writeFile(
        toFsPath(summaryTemp),
        JSON.stringify(toItem(record)),
        'utf-8',
      )
      await rename(toFsPath(summaryTemp), toFsPath(summary))
    } catch {
      // 列表回落到完整记录
    }
  }

  const listRecords = async (): Promise<HistoryRecord[]> => {
    await cleanupStaleTemps()

    let names: string[]

    try {
      names = await readdir(toFsPath(dir))
    } catch {
      return []
    }

    const records: HistoryRecord[] = []

    for (const name of names) {
      if (!name.endsWith('.json')) continue

      try {
        const raw = await readFile(toFsPath(join(dir, name)), 'utf-8')
        const parsed: unknown = JSON.parse(raw)

        if (isRecord(parsed)) records.push(parsed)
      } catch {
        // 跳过损坏的条目
      }
    }

    records.sort((a, b) => b.createdAt - a.createdAt)

    return records
  }

  const listHistory = async (): Promise<ScanHistoryItem[]> => {
    await cleanupStaleTemps()

    let names: string[]

    try {
      names = await readdir(toFsPath(dir))
    } catch {
      return []
    }

    const items: ScanHistoryItem[] = []

    for (const name of names) {
      // .summary.json 是 sidecar，不是独立记录
      if (!name.endsWith('.json') || name.endsWith('.summary.json')) continue

      const id = name.slice(0, -5)
      const summary = await readSummary(id)

      if (summary) {
        items.push({
          ...summary,
          restorable: existsSync(toFsPath(recordPath(id))),
        })
        continue
      }

      // 旧记录没有 sidecar：回落到完整 JSON，行为不变
      const record = await readRecord(id)

      if (record) items.push(toItem(record))
    }

    items.sort((a, b) => b.createdAt - a.createdAt)

    return items
  }

  const readRecord = async (id: string): Promise<HistoryRecord | null> => {
    try {
      const raw = await readFile(toFsPath(recordPath(id)), 'utf-8')
      const parsed: unknown = JSON.parse(raw)

      return isRecord(parsed) ? parsed : null
    } catch {
      return null
    }
  }

  const deleteRecord = async (id: string): Promise<void> => {
    await rm(toFsPath(recordPath(id)), { force: true })
    await rm(toFsPath(summaryPath(id)), { force: true })
    // 同时清掉可能残留的临时文件
    await rm(toFsPath(`${recordPath(id)}.tmp`), { force: true })
  }

  const clearRecords = async (): Promise<void> => {
    let names: string[]

    try {
      names = await readdir(toFsPath(dir))
    } catch {
      return
    }

    await Promise.all(
      names
        .filter((name) => name.endsWith('.json') || name.endsWith('.tmp'))
        .map((name) => rm(toFsPath(join(dir, name)), { force: true })),
    )
  }

  /**
   * 按保留条数裁剪：只删超出部分最旧的记录。
   * 运行中的任务本来就不会落盘，所以这里不用考虑「删掉正在写的文件」。
   */
  const trimRecords = async (limit: number): Promise<void> => {
    const records = await listHistory()
    const overflow = records.slice(normalizeHistoryLimit(limit))

    await Promise.all(overflow.map((record) => deleteRecord(record.id)))
  }

  return {
    saveRecord,
    listRecords,
    listHistory,
    readRecord,
    deleteRecord,
    clearRecords,
    trimRecords,
  }
}

let defaultStore: HistoryStore | null = null

const store = (): HistoryStore => {
  defaultStore ??= createHistoryStore(join(app.getPath('userData'), 'history'))

  return defaultStore
}

// 生产路径：默认 store 延迟到第一次访问才解析 userData，便于测试注入临时目录
export const saveRecord = (
  ...args: Parameters<HistoryStore['saveRecord']>
): Promise<void> => store().saveRecord(...args)

export const listRecords = (): Promise<HistoryRecord[]> => store().listRecords()

export const listHistory = (): Promise<ScanHistoryItem[]> =>
  store().listHistory()

export const readRecord = (id: string): Promise<HistoryRecord | null> =>
  store().readRecord(id)

export const deleteRecord = (id: string): Promise<void> =>
  store().deleteRecord(id)

export const clearRecords = (): Promise<void> => store().clearRecords()

export const trimRecords = (limit: number): Promise<void> =>
  store().trimRecords(limit)

export type { HistoryRecord }
