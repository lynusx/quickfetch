import { stat } from 'node:fs/promises'

import type { ScannedImage } from '../../../shared/ipc'
import { toFsPath } from '../../utils/pathx'
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

/** 界面预检查是交互操作，不能按复制档位（6–10）去抢共享盘 */
const DEFAULT_CONCURRENCY = 8

/** 超过这个张数就不在交互路径上逐张 stat，与复制前的量测阈值保持一致 */
const MAX_MEASURE_ITEMS = 5000

/** 缓存上限；现场跑一整天也不会超过，超了直接清空，避免无界增长 */
const MAX_CACHE_ENTRIES = 50_000

const sizeCache = new Map<string, number>()

const statSize = async (path: string): Promise<number | null> => {
  const cached = sizeCache.get(path)

  if (cached !== undefined) return cached

  try {
    const info = await stat(toFsPath(path))

    if (sizeCache.size >= MAX_CACHE_ENTRIES) sizeCache.clear()

    sizeCache.set(path, info.size)

    return info.size
  } catch {
    // 源文件不可读时复制本来就会失败，大小按未知处理即可
    return null
  }
}

export interface SizeTotals {
  /** 已知体积之和；全部失败时为 0 */
  totalBytes: number
  /** 拿不到 size 的张数 */
  sizeUnknown: number
}

/** 量一批文件的总体积；命中缓存的不再 stat */
export const measureImageSizes = async (
  images: ScannedImage[],
  concurrency = DEFAULT_CONCURRENCY,
): Promise<SizeTotals> => {
  // 极端大任务不在交互路径上逐张 stat：几千次网络往返会让「勾一下机台」
  // 看起来像卡住。此时展示层回退为「大小未知」。
  if (images.length > MAX_MEASURE_ITEMS) {
    return { totalBytes: 0, sizeUnknown: images.length }
  }

  const limit = createLimiter(concurrency)
  let totalBytes = 0
  let sizeUnknown = 0

  await Promise.all(
    images.map((image) =>
      limit(async () => {
        const size = await statSize(image.absolutePath)

        if (size === null) sizeUnknown += 1
        else totalBytes += size
      }),
    ),
  )

  return { totalBytes, sizeUnknown }
}

/** 单个文件的 size：命中缓存直接返回，供复制前量测复用 */
export const cachedSizeOf = (path: string): Promise<number | null> =>
  statSize(path)
