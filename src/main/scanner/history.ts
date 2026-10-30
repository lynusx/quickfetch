import { app } from 'electron'
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
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
} from '../../shared/ipc'

import { toFsPath } from '../pathx'
import { normalizeHistoryLimit } from '../../shared/historyLimit'

/** 单条历史的结果文件格式版本 */
const RECORD_VERSION = 1

interface HistoryRecord {
  version: typeof RECORD_VERSION
  id: string
  status: ScanTaskStatus
  params: ScanTaskParams
  branches: ScanBranch[]
  /** 全量图片路径，恢复历史与再次复制都靠它 */
  images: { path: string; absolutePath: string; name: string }[]
  progress: ScanTask['progress']
  createdAt: number
  startedAt: number | null
  finishedAt: number | null
}

const historyDir = (): string => join(app.getPath('userData'), 'history')

/** 目录名即任务 id；id 由主进程生成 UUID，不含路径分隔符，可直接拼 */
const recordPath = (id: string): string => join(historyDir(), `${id}.json`)

const ensureDir = async (): Promise<void> => {
  await mkdir(historyDir(), { recursive: true })
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

/**
 * 落盘一次扫描结果。
 *
 * 只保存已结束的任务，且必须扫到过图片或已有明确诊断结论 ——
 * 中途取消且一张没扫到、也没有诊断信息的任务存下来只是噪音，
 * 用户点进去看到空列表，反而以为历史坏了。
 */
export const saveRecord = async (
  task: ScanTask,
  images: ScannedImage[],
): Promise<void> => {
  if (task.status === 'pending' || task.status === 'running') return
  if (task.status === 'paused') return

  // 「有诊断」只认真正读过目录的分支：断链会给 missing/unreachable，
  // 读到了内容会给 empty/hit。仍是 skipped 说明这个机台根本没轮到，
  // 不能算作有效结论，否则取消瞬间的空任务也会被当成有信息存下来。
  const diagnosed = task.branches.some((branch) => branch.status !== 'skipped')

  if (!images.length && !diagnosed) return

  const record: HistoryRecord = {
    version: RECORD_VERSION,
    id: task.id,
    status: task.status,
    params: task.params,
    branches: task.branches,
    // 必须存全量：历史任务的再次复制要能读到每一张图，
    // 只存预览的话恢复出来的任务会把 200 条之后的结果静默丢掉
    images: images.map((image) => ({
      path: image.path,
      absolutePath: image.absolutePath,
      name: image.name,
    })),
    progress: task.progress,
    createdAt: task.createdAt,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
  }

  await ensureDir()

  const target = recordPath(record.id)
  const temp = `${target}.tmp`

  // 原子写：扫描完成时系统可能正在休眠或断电，半截 JSON 会毁掉整条历史
  await writeFile(toFsPath(temp), JSON.stringify(record), 'utf-8')
  await rename(toFsPath(temp), toFsPath(target))
}

const toItem = (record: HistoryRecord): ScanHistoryItem => ({
  id: record.id,
  status: record.status,
  params: record.params,
  totalImages: record.images.length,
  hitMachines: record.branches.filter((branch) => branch.images > 0).length,
  machineCount: record.branches.length,
  elapsedMs:
    (record.finishedAt ?? record.createdAt) -
    (record.startedAt ?? record.createdAt),
  createdAt: record.createdAt,
  finishedAt: record.finishedAt,
  restorable: true,
})

/**
 * 列出历史记录，按创建时间倒序。
 *
 * 单个文件残缺（比如上次写入时进程被杀）只跳过该条，不影响整体列表 ——
 * 历史是辅助功能，不该因为它让页面起不来。
 */
export const listRecords = async (): Promise<HistoryRecord[]> => {
  let names: string[]

  try {
    names = await readdir(toFsPath(historyDir()))
  } catch {
    return []
  }

  const records: HistoryRecord[] = []

  for (const name of names) {
    if (!name.endsWith('.json')) continue

    try {
      const raw = await readFile(toFsPath(join(historyDir(), name)), 'utf-8')
      const parsed: unknown = JSON.parse(raw)

      if (isRecord(parsed)) records.push(parsed)
    } catch {
      // 跳过损坏的条目
    }
  }

  records.sort((a, b) => b.createdAt - a.createdAt)

  return records
}

export const listHistory = async (): Promise<ScanHistoryItem[]> => {
  const records = await listRecords()

  return records.map(toItem)
}

/** 读取完整记录，供恢复历史任务使用 */
export const readRecord = async (id: string): Promise<HistoryRecord | null> => {
  try {
    const raw = await readFile(toFsPath(recordPath(id)), 'utf-8')
    const parsed: unknown = JSON.parse(raw)

    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

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
  preview: record.images.slice(0, 200),
  elapsedMs:
    (record.finishedAt ?? record.createdAt) -
    (record.startedAt ?? record.createdAt),
})

export const deleteRecord = async (id: string): Promise<void> => {
  await rm(toFsPath(recordPath(id)), { force: true })
  // 同时清掉可能残留的临时文件
  await rm(toFsPath(`${recordPath(id)}.tmp`), { force: true })
}

export const clearRecords = async (): Promise<void> => {
  let names: string[]

  try {
    names = await readdir(toFsPath(historyDir()))
  } catch {
    return
  }

  await Promise.all(
    names
      .filter((name) => name.endsWith('.json') || name.endsWith('.tmp'))
      .map((name) => rm(toFsPath(join(historyDir(), name)), { force: true })),
  )
}

/**
 * 按保留条数裁剪：只删超出部分最旧的记录。
 * 运行中的任务本来就不会落盘，所以这里不用考虑「删掉正在写的文件」。
 */
export const trimRecords = async (limit: number): Promise<void> => {
  const records = await listRecords()
  const overflow = records.slice(normalizeHistoryLimit(limit))

  await Promise.all(overflow.map((record) => deleteRecord(record.id)))
}

export type { HistoryRecord }
