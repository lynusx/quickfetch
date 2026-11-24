import { stat } from 'node:fs/promises'

import type { ScannedImage } from '../../../shared/ipc'
import { toFsPath } from '../../utils/pathx'
import { NETWORK_CODES } from '../scanner/fsx'
import { createLimiter } from '../scanner/limiter'

/**
 * 待复制文件的体积统计。
 *
 * 预检查（勾选机台）与真正开始复制都要知道这批图有多大，两边都走这里：
 * stat 成功的结果按绝对路径缓存，第二次勾选同一批机台不再打网络 IO。
 *
 * 共享盘上的产出图只增不改，缓存不设过期；失败的项**不缓存** ——
 * 现场最常见的是临时未认证，重试一次就可能读到，缓存成「未知」反而会
 * 让随后开始的复制沿用错误结论。
 */

/**
 * 界面预检查并发上限：Windows libuv 默认线程池只有 4 个线程，
 * 预检查最多占 2 个，永远给本地历史记录/设置/日志读写留出线程，
 * 避免离线共享盘 SMB 阻塞把主进程全部文件 IO 饿死。
 */
const DEFAULT_CONCURRENCY = 2

/** 单次 stat 超时；SMB 离线主机在 Windows 上默认可阻塞 20–45 秒 */
const STAT_TIMEOUT_MS = 1_500

/** 交互式预检查整批总时间预算；超出后立即停止继续 stat，剩余按大小未知处理 */
const MAX_MEASURE_DURATION_MS = 3_000

/** 同一主机/盘符根连续失败达到此阈值即熔断，跳过该根下剩余所有图片 */
const ROOT_FAILURE_THRESHOLD = 3

/** 超过这个张数就不在交互路径上逐张 stat，与复制前的量测阈值保持一致 */
const MAX_MEASURE_ITEMS = 5000

/** 缓存上限；现场跑一整天也不会超过，超了直接清空，避免无界增长 */
const MAX_CACHE_ENTRIES = 50_000

const sizeCache = new Map<string, number>()

/** 将扫描阶段已拿到的文件体积写入缓存，后续复制预估与复制任务直接复用 */
export const cacheImageSize = (path: string, size: number): void => {
  if (sizeCache.size >= MAX_CACHE_ENTRIES) sizeCache.clear()
  sizeCache.set(path, size)
}

interface StatOutcome {
  size: number | null
  networkError: boolean
}

/** 提取路径所属的主机/共享根（`\\host\share` 或 `d:`），用于按来源熔断 */
const rootOf = (filePath: string): string => {
  const normalized = filePath.replace(/\//g, '\\')
  const unc = normalized.match(/^(\\\\[^\\]+\\[^\\]+)/)

  if (unc) return unc[1].toLowerCase()

  const drive = normalized.match(/^([a-zA-Z]:)/)

  return drive ? drive[1].toLowerCase() : ''
}

const statWithTimeout = async (
  path: string,
  timeoutMs: number,
): Promise<StatOutcome> => {
  const request = stat(toFsPath(path))

  // 超时放弃等待时挂上空回调，避免底层 stat 晚些 reject 变成未处理异常
  request.then(
    () => {},
    () => {},
  )

  let timer: ReturnType<typeof setTimeout> | undefined

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`stat 超时（${timeoutMs}ms）：${path}`)
      ;(error as NodeJS.ErrnoException).code = 'ETIMEDOUT'
      reject(error)
    }, timeoutMs)
  })

  try {
    const info = await Promise.race([request, timeout])
    return { size: info.size, networkError: false }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code
    return {
      size: null,
      networkError: Boolean(code && NETWORK_CODES.has(code)),
    }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

const statSize = async (
  path: string,
  timeoutMs?: number,
): Promise<StatOutcome> => {
  const cached = sizeCache.get(path)

  if (cached !== undefined) return { size: cached, networkError: false }

  const outcome =
    timeoutMs !== undefined
      ? await statWithTimeout(path, timeoutMs)
      : await stat(toFsPath(path))
          .then((info) => ({ size: info.size, networkError: false }))
          .catch((error: unknown) => {
            const code = (error as NodeJS.ErrnoException | undefined)?.code
            return {
              size: null,
              networkError: Boolean(code && NETWORK_CODES.has(code)),
            }
          })

  if (outcome.size !== null) {
    if (sizeCache.size >= MAX_CACHE_ENTRIES) sizeCache.clear()
    sizeCache.set(path, outcome.size)
  }

  return outcome
}

export interface SizeTotals {
  /** 已知体积之和；全部失败时为 0 */
  totalBytes: number
  /** 拿不到 size 的张数 */
  sizeUnknown: number
}

/**
 * 量一批文件的总体积；命中缓存的不再 stat。
 *
 * 带三层保护防止离线共享盘或外机历史记录拖死主进程：
 * 1. 低并发（默认 2），不占满 libuv 线程池；
 * 2. 按路径根（UNC 共享/盘符）熔断：网络错误立刻熔断，连续失败 3 次也熔断；
 * 3. 总时间预算（3 秒），超时即停止派发剩余 stat。
 */
export const measureImageSizes = async (
  images: ScannedImage[],
  concurrency = DEFAULT_CONCURRENCY,
): Promise<SizeTotals> => {
  if (images.length > MAX_MEASURE_ITEMS) {
    return { totalBytes: 0, sizeUnknown: images.length }
  }

  const limit = createLimiter(concurrency)
  const deadline = Date.now() + MAX_MEASURE_DURATION_MS
  const deadRoots = new Set<string>()
  const consecutiveFailures = new Map<string, number>()

  let totalBytes = 0
  let sizeUnknown = 0

  await Promise.all(
    images.map((image) =>
      limit(async () => {
        if (image.size !== undefined) {
          cacheImageSize(image.absolutePath, image.size)
          totalBytes += image.size
          return
        }

        const cached = sizeCache.get(image.absolutePath)

        if (cached !== undefined) {
          totalBytes += cached
          return
        }

        const root = rootOf(image.absolutePath)

        if ((root && deadRoots.has(root)) || Date.now() >= deadline) {
          sizeUnknown += 1
          return
        }

        const remaining = deadline - Date.now()

        if (remaining <= 0) {
          sizeUnknown += 1
          return
        }

        const outcome = await statSize(
          image.absolutePath,
          Math.min(STAT_TIMEOUT_MS, remaining),
        )

        if (outcome.size !== null) {
          totalBytes += outcome.size
          if (root) consecutiveFailures.delete(root)
          return
        }

        sizeUnknown += 1

        if (!root) return

        if (outcome.networkError) {
          deadRoots.add(root)
          return
        }

        const nextFailures = (consecutiveFailures.get(root) ?? 0) + 1
        consecutiveFailures.set(root, nextFailures)

        if (nextFailures >= ROOT_FAILURE_THRESHOLD) {
          deadRoots.add(root)
        }
      }),
    ),
  )

  return { totalBytes, sizeUnknown }
}

/** 单个文件的 size：命中缓存直接返回，供复制前量测复用 */
export const cachedSizeOf = async (path: string): Promise<number | null> =>
  (await statSize(path)).size
