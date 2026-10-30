import { copyFile, readdir, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'

import type {
  CopyImagesResult,
  CopyProgress,
  ScannedImage,
} from '../shared/ipc'

import { toFsPath } from './pathx'

/** 同时打开的文件句柄上限，Windows 上超过 20 容易遇到共享冲突 */
const COPY_CONCURRENCY = 10

const PROGRESS_INTERVAL_MS = 100

const MANIFEST_NAME = 'source.txt'

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
}

/**
 * 把扫描结果平铺复制到目标目录，并写入 source.txt 路径清单。
 *
 * 目标名先在内存里串行规划好再并发复制：并发下各自判断「文件是否存在」
 * 会出现同名文件同时判定为空闲、相互覆盖的竞态。
 */
export const copyImagesTo = async (
  images: ScannedImage[],
  targetDir: string,
  options: CopyOptions = {},
): Promise<CopyImagesResult> => {
  if (!images.length) {
    throw new Error('没有可复制的图片，请先完成扫描')
  }

  let entries: string[]
  try {
    entries = await readdir(toFsPath(targetDir))
  } catch (error) {
    throw new Error(
      `目标目录不可访问：${targetDir}（${(error as Error)?.message ?? '未知错误'}）`,
    )
  }

  const taken = new Set(entries.map((name) => name.toLowerCase()))
  const plan = images.map((image) => {
    const target = uniqueName(image.name, taken)
    taken.add(target.toLowerCase())

    return {
      from: image.absolutePath,
      to: join(targetDir, target),
      renamed: target !== image.name,
    }
  })

  const manifestPath = join(targetDir, MANIFEST_NAME)
  await writeFile(
    toFsPath(manifestPath),
    images.map((image) => image.path).join('\n'),
    'utf-8',
  )

  const total = plan.length
  const failed: string[] = []
  let copied = 0
  let renamed = plan.filter((item) => item.renamed).length
  let lastReportAt = 0

  const report = (force = false): void => {
    if (!options.onProgress) return

    const now = Date.now()
    if (!force && now - lastReportAt < PROGRESS_INTERVAL_MS) return

    lastReportAt = now
    options.onProgress({ copied, total, failed: failed.length })
  }

  const copyOne = async (item: (typeof plan)[number]): Promise<void> => {
    try {
      await copyFile(toFsPath(item.from), toFsPath(item.to))
      copied += 1
    } catch (error) {
      // 源文件被占用、权限不足等，记录后继续，不中断整批
      console.error(`复制文件 ${item.from} 失败:`, error)
      failed.push(item.from)
      if (item.renamed) renamed -= 1
    } finally {
      report()
    }
  }

  for (let index = 0; index < total; index += COPY_CONCURRENCY) {
    await Promise.all(
      plan.slice(index, index + COPY_CONCURRENCY).map((item) => copyOne(item)),
    )
  }

  report(true)

  return { copied, failed, manifestPath, renamed }
}
