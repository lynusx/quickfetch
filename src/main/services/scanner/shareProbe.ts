import { join } from 'node:path'

import { logger } from '../log'
import { readDirSafe } from './fsx'
import type { DirReadResult, DirReadStatus } from './fsx'

/**
 * LXT/PL 共享名探测的共同部分。
 *
 * 两个类别真正相同的只有：
 * 1. 先读共享根、再读固定子目录的两步探测（区分「没认证」与「没这个目录」）
 * 2. 任务日期 + 近 30 天的日期窗口判断
 * 3. 网络闪断重试一次
 *
 * 候选名、tie-break、path shape 与展示 segments 仍由各自 resolver 拥有。
 * 这里通过注入 reader 与 date parser 保持可测试，不依赖 fs 或 electron。
 */

export const PROBE_TIMEOUT_MS = 8_000
export const RECENT_DAYS = 30
export const DAY_MS = 86_400_000

const RETRY_DELAY_MS = 600

export type DirectoryReader = (
  path: string,
  timeoutMs: number,
) => Promise<DirReadResult>

export type DateParser = (value: string) => number | null

const fsReader: DirectoryReader = (path, timeoutMs) =>
  readDirSafe(path, { timeoutMs })

/**
 * 探测专用读取：网络闪断时再试一次。
 *
 * 首次连某台机器的共享要先做 SMB 会话协商，慢起来十几秒很常见；
 * 一次超时就判「没接专用内网」会把整批机台带偏，所以重试一次再下结论。
 */
export const probeSharePath = async (
  path: string,
  read: DirectoryReader = fsReader,
): Promise<DirReadResult> => {
  const first = await read(path, PROBE_TIMEOUT_MS)

  if (first.status !== 'unreachable') return first

  logger.debug('resolver', 'probe.retry', {
    path,
    status: first.status,
    code: first.code,
    elapsedMs: first.elapsedMs,
    error: first.raw,
  })

  await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))

  const second = await read(path, PROBE_TIMEOUT_MS)

  logger.debug('resolver', 'probe.retry.result', {
    path,
    status: second.status,
    code: second.code,
    elapsedMs: second.elapsedMs,
    error: second.raw,
  })

  return second
}

export interface ShareCandidateInput<Share extends string> {
  host: string
  share: Share
  /** 共享根下的固定子目录，如力禧特的 A-01-B、利珀的 Matting */
  child: string
  /** 本次扫描日期，格式由 parseDate 决定 */
  taskDate: string
  parseDate: DateParser
  /** 多个候选的优先级，力禧特不需要，利珀用 */
  order?: number
  read?: DirectoryReader
}

export interface ShareCandidate<Share extends string> {
  share: Share
  order: number
  status: DirReadStatus
  /** 共享根单独一次的读取状态；它才是判「没认证」的依据 */
  rootStatus: DirReadStatus
  hasTaskDate: boolean
  hasRecentDate: boolean
}

export const readShareCandidate = async <Share extends string>(
  input: ShareCandidateInput<Share>,
): Promise<ShareCandidate<Share>> => {
  const { host, share, child, taskDate, parseDate, order = 0, read } = input

  const root = await probeSharePath(join(host, share), read)
  const result =
    root.status === 'ok'
      ? await probeSharePath(join(host, share, child), read)
      : { ...root, dirs: [] as string[] }

  const dates = result.status === 'ok' ? result.dirs : []
  const taskStamp = parseDate(taskDate)
  const floor = taskStamp === null ? null : taskStamp - RECENT_DAYS * DAY_MS
  const hasTaskDate =
    taskStamp !== null && dates.some((name) => parseDate(name) === taskStamp)
  const hasRecentDate =
    taskStamp !== null &&
    floor !== null &&
    dates.some((name) => {
      const stamp = parseDate(name)
      return stamp !== null && stamp >= floor && stamp <= taskStamp
    })

  return {
    share,
    order,
    status: result.status,
    rootStatus: root.status,
    hasTaskDate,
    hasRecentDate,
  }
}
