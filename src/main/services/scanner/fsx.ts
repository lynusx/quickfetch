import { readdir, stat } from 'node:fs/promises'
import type { Dirent } from 'node:fs'

import { toFsPath } from '../../utils/pathx'

/** 目录读取结果：把「不存在」「无权限」「不可达」区分开，避免一律报「未找到」 */
export type DirReadStatus = 'ok' | 'missing' | 'denied' | 'unreachable'

export interface DirReadResult {
  status: DirReadStatus
  /** 子目录名，已按名称自然序排好 */
  dirs: string[]
  /** 文件名，仅收图时使用 */
  files: string[]
  error?: string
  /** 原始错误码，界面诊断用；miss 时为 ENOENT 这类 */
  code?: string
  /** 本次读取耗时，供调用方做自适应并发判断 */
  elapsedMs: number
}

/** 默认读取超时。现场 8G 内存机器上 SMB 抖动更明显，由任务按需下探 */
export const DEFAULT_TIMEOUT_MS = 20_000

/** 超时后延迟这么久才真正放弃，给底层请求自然结束的机会 */
const ABANDON_GRACE_MS = 1_500

/**
 * 明确的网络层错误码。
 *
 * 只把这类算「不可达」—— 断网熔断全靠它，宁可漏报也别误报：
 * 早先把所有非 ENOENT/EACCES 都当成网络问题，结果 Windows 访问
 * `\\IP`（只有主机、没有共享名）时返回的 EINVAL 被算成断网，
 * 现场就出现「路径明明能打开，却提示没接专用内网」。
 */
const NETWORK_CODES = new Set([
  'ETIMEDOUT',
  'ECONNREFUSED',
  'ECONNRESET',
  'ECONNABORTED',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENETDOWN',
  'EHOSTDOWN',
  'ENETRESET',
  'ENOTCONN',
  'ENONET',
  'EADDRNOTAVAIL',
  'EPIPE',
  'EIO',
  'ESTALE',
  'ENODEV',
  'ENXIO',
  'EAI_AGAIN',
])

/** 路径本身就是坏的（共享名写错、把文件当目录读），跟网络无关 */
const PATH_CODES = new Set([
  'ENOENT',
  'ENOTDIR',
  'EINVAL',
  'ENAMETOOLONG',
  'EISDIR',
  'EBADF',
  'EBUSY',
])

/** 从异常里取错误码，统一给状态判定和界面诊断用 */
const codeOf = (error: unknown): string | undefined =>
  (error as NodeJS.ErrnoException | undefined)?.code

/**
 * 错误码 → 状态。
 *
 * 只有明确列出的网络错误才算「不可达」。其余一律当「这个目录用不了」：
 * 断网的表现里，能让人误判成「路径不对」的极少，反过来把路径问题
 * 当成断网的却很常见（UNC 根不可枚举的 EINVAL 就是典型），
 * 一误判就会熔断整个任务并提示「请接专用内网」，比漏报难查得多。
 */
const toStatus = (error: unknown): DirReadStatus => {
  const code = codeOf(error)

  if (code && PATH_CODES.has(code)) return 'missing'
  if (code === 'EACCES' || code === 'EPERM') return 'denied'
  if (code && NETWORK_CODES.has(code)) return 'unreachable'

  return 'missing'
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
  code?: string,
): DirReadResult => ({ status, dirs: [], files: [], error, code, elapsedMs })

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

    return emptyResult(
      status,
      elapsedMs,
      (error as Error)?.message,
      codeOf(error),
    )
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
