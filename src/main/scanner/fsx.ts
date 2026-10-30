import { readdir, stat } from 'node:fs/promises'

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
}

/**
 * 单个目录读取的超时时间。
 * SMB 在链路抖动时单次 readdir 可能挂几十秒，不设上限会让整个任务看起来假死；
 * 15 秒足够覆盖网络盘正常往返，超过就按「不可达」处理。
 */
const TIMEOUT_MS = 15_000

/** 给 fs 调用套一层超时；fs 本身没有 timeout 选项 */
const withTimeout = <T>(
  run: Promise<T>,
  path: string,
  ms = TIMEOUT_MS,
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`读取超时（${ms} 毫秒）：${path}`)
      ;(error as NodeJS.ErrnoException).code = 'ETIMEDOUT'
      reject(error)
    }, ms)
  })

  return Promise.race([run, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

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

/** 读取目录并按目录/文件分组；任何异常都转成状态，不向上抛 */
export const readDirSafe = async (path: string): Promise<DirReadResult> => {
  try {
    const entries = await withTimeout(
      readdir(toFsPath(path), { withFileTypes: true }),
      path,
    )

    const dirs: string[] = []
    const files: string[] = []

    for (const entry of entries) {
      if (entry.isDirectory()) dirs.push(entry.name)
      else if (entry.isFile()) files.push(entry.name)
    }

    dirs.sort(compareName)

    return { status: 'ok', dirs, files }
  } catch (error) {
    const status = toStatus(error)

    if (status !== 'missing') {
      console.error(`读取目录 ${path} 失败:`, (error as Error)?.message)
    }

    return {
      status,
      dirs: [],
      files: [],
      error: (error as Error)?.message,
    }
  }
}

/** 探测目录是否存在；任务开始前用它判断根目录是否可达 */
export const probePath = async (
  path: string,
): Promise<{ ok: boolean; status: DirReadStatus }> => {
  try {
    const info = await withTimeout(stat(toFsPath(path)), path)

    return {
      ok: info.isDirectory(),
      status: info.isDirectory() ? 'ok' : 'missing',
    }
  } catch (error) {
    return { ok: false, status: toStatus(error) }
  }
}
