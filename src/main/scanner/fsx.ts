import { readdir, stat } from 'node:fs/promises'
import type { Dirent } from 'node:fs'

import { toFsPath } from '../pathx'

/** 目录读取结果：把「不存在」「无权限」「不可达」区分开，避免一律报「未找到」 */
export type DirReadStatus = 'ok' | 'missing' | 'denied' | 'unreachable'

export interface DirReadResult {
  status: DirReadStatus
  /** 子目录名，已按名称自然序排好 */
  dirs: string[]
  /** 文件名，仅收图时使用 */
  files: string[]
  error?: string
  /** 本次读取耗时，供调用方做自适应并发判断 */
  elapsedMs: number
}

/** 默认读取超时。现场 8G 内存机器上 SMB 抖动更明显，由任务按需下探 */
export const DEFAULT_TIMEOUT_MS = 20_000

/** 超时后延迟这么久才真正放弃，给底层请求自然结束的机会 */
const ABANDON_GRACE_MS = 1_500

const toStatus = (error: unknown): DirReadStatus => {
  const code = (error as NodeJS.ErrnoException | undefined)?.code

  if (code === 'ENOENT') return 'missing'
  if (code === 'EACCES' || code === 'EPERM') return 'denied'

  // 网络盘断开时的典型错误：超时、主机不可达、连接被重置、I/O 错误
  return 'unreachable'
}

/** 判断是否为「网络链路问题」而非「目录本身不存在」，用于断连熔断 */
export const isNetworkError = (status: DirReadStatus): boolean =>
  status === 'unreachable'

const compareName = (a: string, b: string): number =>
  a.localeCompare(b, 'zh-CN', { numeric: true })

const emptyResult = (
  status: DirReadStatus,
  elapsedMs: number,
  error?: string,
): DirReadResult => ({ status, dirs: [], files: [], error, elapsedMs })

export interface ReadOptions {
  /** 单次读取超时，默认 20 秒 */
  timeoutMs?: number
}

/**
 * 读取目录并按目录/文件分组；任何异常都转成状态，不向上抛。
 *
 * 超时不是「放弃这个 Promise 就完事」：底层 readdir 仍会占用句柄和网络连接，
 * 在 8G 机器上大批超时任务堆着不放会直接把进程拖死。所以超时后仍挂上
 * 回调等待它自然结束（最多再等 1.5 秒），期间不产生任何额外读取。
 */
export const readDirSafe = async (
  path: string,
  options: ReadOptions = {},
): Promise<DirReadResult> => {
  const startedAt = Date.now()
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const request = readdir(toFsPath(path), { withFileTypes: true })

  let timer: ReturnType<typeof setTimeout> | undefined
  let settled = false

  // 超时后底层请求仍会结束，先挂上 then 避免它变成未处理的 rejection
  const finished = request.then(
    () => {
      settled = true
    },
    () => {
      settled = true
    },
  )

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`读取超时（${timeoutMs} 毫秒）：${path}`)
      ;(error as NodeJS.ErrnoException).code = 'ETIMEDOUT'
      reject(error)
    }, timeoutMs)
  })

  try {
    const entries = await Promise.race<Dirent[]>([request, timeout])

    const dirs: string[] = []
    const files: string[] = []

    for (const entry of entries) {
      if (entry.isDirectory()) dirs.push(entry.name)
      else if (entry.isFile()) files.push(entry.name)
    }

    dirs.sort(compareName)

    return { status: 'ok', dirs, files, elapsedMs: Date.now() - startedAt }
  } catch (error) {
    const status = toStatus(error)
    const elapsedMs = Date.now() - startedAt

    if (status !== 'missing') {
      console.error(`读取目录 ${path} 失败:`, (error as Error)?.message)
    }

    // 尽力收回底层请求，减少超时任务在后台堆积
    if (!settled) {
      await Promise.race([
        finished,
        new Promise<void>((resolve) => {
          setTimeout(resolve, ABANDON_GRACE_MS)
        }),
      ])
    }

    return emptyResult(status, elapsedMs, (error as Error)?.message)
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** 探测目录是否存在；任务开始前用它判断根目录是否可达 */
export const probePath = async (
  path: string,
  options: ReadOptions = {},
): Promise<{ ok: boolean; status: DirReadStatus }> => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const request = stat(toFsPath(path))

  let timer: ReturnType<typeof setTimeout> | undefined

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`探测超时（${timeoutMs} 毫秒）：${path}`)
      ;(error as NodeJS.ErrnoException).code = 'ETIMEDOUT'
      reject(error)
    }, timeoutMs)
  })

  try {
    const info = await Promise.race([request, timeout])

    return {
      ok: info.isDirectory(),
      status: info.isDirectory() ? 'ok' : 'missing',
    }
  } catch (error) {
    // 超时后底层 stat 仍会结束，这里吞掉结果避免未处理的 rejection
    request.catch(() => undefined)

    return { ok: false, status: toStatus(error) }
  } finally {
    if (timer) clearTimeout(timer)
  }
}
