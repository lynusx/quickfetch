import type { ScannedImage } from '../../../shared/ipc'
import type { FileStatMeta } from '../scanner/fsx'
import { statFileSafe } from '../scanner/fsx'
import { createLimiter } from '../scanner/limiter'

/**
 * 待复制图片的统一体积解析器。
 *
 * 扫描阶段（ADR-0010）已将每张图片的体积直接记录在 `ScannedImage.size` 上，
 * 并随历史 JSON 一起落盘；因此复制预检查（`planPreview`）与复制执行（`CopyTaskRunner`）
 * 共用同一套两阶段解析：
 *
 * 1. **已知体积直通（零 IO、无张数上限）**：凡是自带 `image.size` 或命中旧记录内部缓存的项，
 *    直接同步累加字节数并回填，哪怕勾选上万张也不会丢失已知体积或发起网络请求；
 * 2. **未知项受限探测**：仅针对缺失 `size` 的旧历史记录执行网络 `stat`，施加 5,000 张上限、
 *    双并发、1.5 秒单文件超时、3 秒整批预算以及按共享根（UNC/盘符）熔断保护。
 */

/**
 * 界面预检查并发上限：Windows libuv 默认线程池只有 4 个线程，
 * 预检查最多占 2 个，永远给本地历史记录/设置/日志读写留出线程，
 * 避免离线共享盘 SMB 阻塞把主进程全部文件 IO 饿死。
 */
const DEFAULT_CONCURRENCY = 2

/** 单次 stat 超时；SMB 离线主机在 Windows 上默认可阻塞 20–45 秒 */
const STAT_TIMEOUT_MS = 1_500

/** 探测整批总时间预算；超出后立即停止继续 stat，剩余未知项按大小未知处理 */
const MAX_MEASURE_DURATION_MS = 3_000

/** 同一主机/盘符根连续失败达到此阈值即熔断，跳过该根下剩余所有未知图片 */
const ROOT_FAILURE_THRESHOLD = 3

/** 未知体积超过此张数时不在路径上逐张 stat，仅汇总已知体积并把未知项标为 sizeUnknown */
const MAX_UNKNOWN_ITEMS = 5_000

/** 旧历史记录探测缓存上限；超了直接清空，避免无界增长 */
const MAX_CACHE_ENTRIES = 50_000

const legacySizeCache = new Map<string, number>()

const rememberSize = (
  cache: Map<string, number>,
  path: string,
  size: number,
): void => {
  if (cache.size >= MAX_CACHE_ENTRIES) cache.clear()
  cache.set(path, size)
}

/** 提取路径所属的主机/共享根（`\\host\share` 或 `d:`），用于按来源熔断 */
const rootOf = (filePath: string): string => {
  const normalized = filePath.replace(/\//g, '\\')
  const unc = normalized.match(/^(\\\\[^\\]+\\[^\\]+)/)

  if (unc) return unc[1].toLowerCase()

  const drive = normalized.match(/^([a-zA-Z]:)/)

  return drive ? drive[1].toLowerCase() : ''
}

export interface SizeTotals {
  /** 已知体积之和；全部未知时为 0 */
  totalBytes: number
  /** 拿不到 size 的张数 */
  sizeUnknown: number
}

export interface MeasureOptions {
  concurrency?: number
  maxUnknownItems?: number
  statTimeoutMs?: number
  totalBudgetMs?: number
  statFile?: (path: string, timeoutMs?: number) => Promise<FileStatMeta>
  cache?: Map<string, number>
  /** 每解析出一张图片的已知字节数时回调对应下标，供执行计划回填 `PlanItem.size` */
  onSize?: (index: number, size: number) => void
}

/**
 * 解析一批图片的总体积；自带 `image.size` 或命中缓存的项零 IO 直接汇总，
 * 仅对缺失 `size` 的项执行受限 `stat` 探测。
 */
export const measureImageSizes = async (
  images: ScannedImage[],
  options: MeasureOptions = {},
): Promise<SizeTotals> => {
  const {
    concurrency = DEFAULT_CONCURRENCY,
    maxUnknownItems = MAX_UNKNOWN_ITEMS,
    statTimeoutMs = STAT_TIMEOUT_MS,
    totalBudgetMs = MAX_MEASURE_DURATION_MS,
    statFile = statFileSafe,
    cache = legacySizeCache,
    onSize,
  } = options

  const unknownIndices: number[] = []
  let totalBytes = 0

  for (let index = 0; index < images.length; index += 1) {
    const image = images[index]

    if (image.size !== undefined) {
      totalBytes += image.size
      onSize?.(index, image.size)
      continue
    }

    const cached = cache.get(image.absolutePath)

    if (cached !== undefined) {
      totalBytes += cached
      onSize?.(index, cached)
      continue
    }

    unknownIndices.push(index)
  }

  if (unknownIndices.length === 0) {
    return { totalBytes, sizeUnknown: 0 }
  }

  if (unknownIndices.length > maxUnknownItems) {
    return { totalBytes, sizeUnknown: unknownIndices.length }
  }

  const limit = createLimiter(concurrency)
  const deadline = Date.now() + totalBudgetMs
  const deadRoots = new Set<string>()
  const consecutiveFailures = new Map<string, number>()

  let sizeUnknown = 0

  await Promise.all(
    unknownIndices.map((index) =>
      limit(async () => {
        const path = images[index].absolutePath
        const cached = cache.get(path)

        if (cached !== undefined) {
          totalBytes += cached
          onSize?.(index, cached)
          return
        }

        const root = rootOf(path)
        const remaining = deadline - Date.now()

        if ((root && deadRoots.has(root)) || remaining <= 0) {
          sizeUnknown += 1
          return
        }

        const meta = await statFile(path, Math.min(statTimeoutMs, remaining))

        if (meta.size !== undefined) {
          rememberSize(cache, path, meta.size)
          totalBytes += meta.size
          onSize?.(index, meta.size)
          if (root) consecutiveFailures.delete(root)
          return
        }

        sizeUnknown += 1

        if (!root) return

        if (meta.networkError) {
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
