import { readdir } from 'node:fs/promises'
import type { Dirent } from 'node:fs'

import { toFsPath } from '../../utils/pathx'
import { logger } from '../log'

/**
 * 目录读取结果：把「不存在」「无权限」「不可达」「读不了」区分开，
 * 避免一律报「未找到」。
 *
 * unreadable 是现场最常见也最容易被误判的一类：Windows 在凭据失败、
 * 共享未挂载、SMB 会话异常时都只返回 `UNKNOWN: unknown error, scandir`，
 * 拿不到 1326/5 这类具体码。它既不是「目录不存在」，也不该算断网，
 * 所以单列一档 —— 界面据此提示「可能是未认证，先去资源管理器输一次密码」，
 * 而不是让用户去翻一个根本不缺的目录。
 */
export type DirReadStatus =
  'ok' | 'missing' | 'denied' | 'unreachable' | 'unreadable'

export interface DirReadResult {
  status: DirReadStatus
  /** 子目录名，已按名称自然序排好 */
  dirs: string[]
  /** 文件名，仅收图时使用 */
  files: string[]
  error?: string
  /** 原始错误码，界面诊断用；miss 时为 ENOENT 这类 */
  code?: string
  /**
   * 原始异常的完整快照（含堆栈、errno、syscall、path）。
   *
   * 只用于日志，不参与状态判定 —— 现场要核对「UNKNOWN / EINVAL」
   * 这类错误码到底该归到哪一档，靠的就是这份原文。
   */
  raw?: DirReadError
  /** 本次读取耗时，供调用方做自适应并发判断 */
  elapsedMs: number
}

/** Node 文件系统异常的原始字段；日志专用 */
export interface DirReadError {
  name: string
  message: string
  code?: string
  errno?: number
  syscall?: string
  path?: string
  stack?: string
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

/** 保留 Node 异常的原始字段；堆栈截断交给日志序列化统一处理 */
const rawErrorOf = (error: unknown): DirReadError => {
  const source = error as NodeJS.ErrnoException | undefined

  return {
    name: error instanceof Error ? error.name : 'Error',
    message: error instanceof Error ? error.message : String(error),
    code: typeof source?.code === 'string' ? source.code : undefined,
    errno: typeof source?.errno === 'number' ? source.errno : undefined,
    syscall: typeof source?.syscall === 'string' ? source.syscall : undefined,
    path: typeof source?.path === 'string' ? source.path : undefined,
    stack: error instanceof Error ? error.stack : undefined,
  }
}

/**
 * 错误码 → 状态。
 *
 * 只有明确列出的网络错误才算「不可达」。明确的路径错误算「不存在」，
 * 明确的权限错误算「无权限」。剩下的未知码（现场最常见的
 * `UNKNOWN: unknown error, scandir`）单独记为 unreadable。
 *
 * 以前未知码一律归 missing，结果是现场看到「目录不存在」就去翻目录，
 * 实际上那台机器只是没认证 —— 结论错得很彻底。宁可承认「读不了，
 * 原因待定」，也不要给一个看起来确定、实际是猜的答案。
 */
const toStatus = (error: unknown): DirReadStatus => {
  const code = codeOf(error)

  if (code && PATH_CODES.has(code)) return 'missing'
  if (code === 'EACCES' || code === 'EPERM') return 'denied'
  if (code && NETWORK_CODES.has(code)) return 'unreachable'

  return 'unreadable'
}

/** 判断是否为「网络链路问题」而非「目录本身不存在」，用于断连熔断 */
export const isNetworkError = (status: DirReadStatus): boolean =>
  status === 'unreachable'

/**
 * 判断是否「这台机器压根没读通」。
 *
 * 与 isNetworkError 的区别：unreadable 多半是没认证，接回网络解决不了，
 * 所以不进断网熔断（否则整批没认证的机台会把任务暂停掉）。
 * 但界面上它必须算「不可访问」，不能像 missing 那样混进「目录不存在」。
 */
export const isInaccessible = (status: DirReadStatus): boolean =>
  status === 'unreachable' || status === 'denied' || status === 'unreadable'

const compareName = (a: string, b: string): number =>
  a.localeCompare(b, 'zh-CN', { numeric: true })

const emptyResult = (
  status: DirReadStatus,
  elapsedMs: number,
  error?: string,
  code?: string,
  raw?: DirReadError,
): DirReadResult => ({
  status,
  dirs: [],
  files: [],
  error,
  code,
  raw,
  elapsedMs,
})

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

    const elapsedMs = Date.now() - startedAt

    logger.debug('fsx', 'read.ok', () => ({
      path,
      status: 'ok',
      elapsedMs,
      dirs: dirs.length,
      dirsSample: dirs.slice(0, 8),
      files: files.length,
      filesSample: files.slice(0, 5),
    }))

    return { status: 'ok', dirs, files, elapsedMs }
  } catch (error) {
    const status = toStatus(error)
    const elapsedMs = Date.now() - startedAt
    const raw = rawErrorOf(error)

    if (status !== 'missing') {
      console.error(
        `读取目录 ${path} 失败（${status}）:`,
        (error as Error)?.message,
      )
      logger.warn('fsx', 'read.fail', {
        path,
        status,
        code: codeOf(error),
        elapsedMs,
        error: raw,
      })
    } else {
      logger.debug('fsx', 'read.missing', {
        path,
        status,
        code: codeOf(error),
        elapsedMs,
        error: raw,
      })
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
      raw,
    )
  } finally {
    if (timer) clearTimeout(timer)
  }
}
