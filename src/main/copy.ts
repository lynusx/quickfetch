import { copyFile, readdir, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'

import type {
  CopyImagesResult,
  CopyProgress,
  ScannedImage,
} from '../shared/ipc'

import { toFsPath } from './pathx'

/**
 * 同时打开的文件句柄上限。现场机器 8G 内存，10 路并发复制 +
 * 每个目标先 stat 一次会瞬时占用 20 个句柄，遇到网络盘共享冲突就开始失败，
 * 所以降到 6，并以每批 50 个文件的粒度推进。
 */
export const DEFAULT_COPY_CONCURRENCY = 6

/** 每批复制的文件数：批与批之间让出事件循环，进度也能按批反馈 */
export const DEFAULT_COPY_BATCH_SIZE = 50

const PROGRESS_INTERVAL_MS = 100

const MANIFEST_NAME = 'source.txt'

/** 批量复制的可调参数 */
export interface CopyLoadOptions {
  concurrency?: number
  batchSize?: number
}

/**
 * 生成不冲突的目标文件名。
 * Windows 文件名大小写不敏感，比较统一转小写，避免 a.jpg 与 A.jpg 互相覆盖。
 */
const uniqueName = (name: string, taken: Set<string>): string => {
  if (!taken.has(name.toLowerCase())) return name

  const ext = extname(name)
  const base = basename(name, ext)

  for (let index = 2; index < 10_000; index += 1) {
    const candidate = `${base} (${index})${ext}`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }

  return `${base}-${Date.now()}${ext}`
}

export interface CopyOptions {
  onProgress?: (progress: CopyProgress) => void
  load?: CopyLoadOptions
}

/**
 * 把扫描结果平铺复制到目标目录，并写入 source.txt 路径清单。
 *
 * 目标名先按批规划：每批开始前查一次同名冲突，规划完再并发复制。
 * 如果一次把几万张的目标名全部算好，内存里会同时挂着几万个 PathLike；
 * 分批后峰值只与 batchSize 相关。
 */
export const copyImagesTo = async (
  images: ScannedImage[],
  targetDir: string,
  options: CopyOptions = {},
): Promise<CopyImagesResult> => {
  if (!images.length) {
    throw new Error('没有可复制的图片，请先完成扫描')
  }

  const concurrency = Math.max(
    1,
    Math.floor(options.load?.concurrency ?? DEFAULT_COPY_CONCURRENCY),
  )
  const batchSize = Math.max(
    1,
    Math.floor(options.load?.batchSize ?? DEFAULT_COPY_BATCH_SIZE),
  )

  let entries: string[]
  try {
    entries = await readdir(toFsPath(targetDir))
  } catch (error) {
    throw new Error(
      `目标目录不可访问：${targetDir}（${(error as Error)?.message ?? '未知错误'}）`,
    )
  }

  // 已占用的目标名，跨批累积，保证同一次任务内不重名
  const taken = new Set(entries.map((name) => name.toLowerCase()))
  const total = images.length
  const failed: string[] = []
  let copied = 0
  let renamed = 0
  let lastReportAt = 0

  // 清单先行写入：复制中途失败时，用户至少还能从 source.txt 找到原始路径
  const manifestPath = join(targetDir, MANIFEST_NAME)
  await writeFile(
    toFsPath(manifestPath),
    images.map((image) => image.path).join('\n'),
    'utf-8',
  )

  const report = (force = false): void => {
    if (!options.onProgress) return

    const now = Date.now()
    if (!force && now - lastReportAt < PROGRESS_INTERVAL_MS) return

    lastReportAt = now
    options.onProgress({
      copied,
      total,
      failed: failed.length,
      batchIndex: Math.min(
        Math.ceil((copied + failed.length) / batchSize),
        Math.ceil(total / batchSize),
      ),
      batchTotal: Math.ceil(total / batchSize),
    })
  }

  for (let offset = 0; offset < total; offset += batchSize) {
    const batch = images.slice(offset, offset + batchSize)

    // 规划本批目标名：先查重名再占位，避免同批内互相覆盖
    const plan = batch.map((image) => {
      const target = uniqueName(image.name, taken)
      taken.add(target.toLowerCase())

      return {
        from: image.absolutePath,
        to: join(targetDir, target),
        renamed: target !== image.name,
      }
    })

    // 每批内部按并发闸门切片推进，批与批之间自然形成一次让出
    for (let index = 0; index < plan.length; index += concurrency) {
      const slice = plan.slice(index, index + concurrency)

      await Promise.all(
        slice.map(async (item) => {
          try {
            await copyFile(toFsPath(item.from), toFsPath(item.to))
            copied += 1
            if (item.renamed) renamed += 1
          } catch (error) {
            // 源文件被占用、权限不足等，记录后继续，不中断整批
            console.error(`复制文件 ${item.from} 失败:`, error)
            failed.push(item.from)
          } finally {
            report()
          }
        }),
      )
    }
  }

  report(true)

  return { copied, failed, manifestPath, renamed }
}
