import { readdir } from 'node:fs/promises'
import { basename, join } from 'node:path'

import type {
  ScanImagesParams,
  ScanImagesResult,
  ScannedImage,
} from '../../src/types/electron'

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif']

const isImageFile = (name: string): boolean =>
  IMAGE_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext))

/** DC 根目录下匹配厂区前缀（如 A01、A02）的子目录 */
const collectValidDirectories = async (
  rootPath: string,
  plant: string,
): Promise<string[]> => {
  const entries = await readdir(rootPath, { withFileTypes: true })
  const pattern = new RegExp(`^${plant}\\d+`)

  return entries
    .filter((entry) => entry.isDirectory() && pattern.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))
}

/**
 * 6 层目录规则（与原 File System Access API 版本保持一致）：
 * 厂区子目录 → EL → 日期 → 班次 → 时段 → 类型 → 图片文件
 */
export const scanImages = async ({
  rootPath,
  plant,
  date,
  shift,
  times,
  types,
}: ScanImagesParams): Promise<ScanImagesResult> => {
  if (basename(rootPath) !== 'DC') {
    throw new Error('请选择名为 DC 的目录')
  }

  const dirs = await collectValidDirectories(rootPath, plant)

  if (!dirs.length) {
    throw new Error(`DC 目录下未找到 ${plant} 厂区的目录，请检查目录结构`)
  }

  const dirSet = new Set(dirs)
  const timeSet = new Set(times)
  const typeSet = new Set(types)

  const validators: ((name: string) => boolean)[] = [
    // 第 0 层：厂区子目录名
    (name) => dirSet.has(name),
    // 第 1 层：固定值 EL
    (name) => name === 'EL',
    // 第 2 层：日期 YYYYMMDD
    (name) => name === date,
    // 第 3 层：班次
    (name) => name === shift,
    // 第 4 层：时段
    (name) => timeSet.has(name),
    // 第 5 层：类型
    (name) => typeSet.has(name),
  ]

  const maxDepth = validators.length
  const images: ScannedImage[] = []

  const walk = async (
    currentPath: string,
    depth: number,
    segments: string[],
  ): Promise<void> => {
    let entries

    try {
      entries = await readdir(currentPath, { withFileTypes: true })
    } catch (error) {
      // 单个目录不可读（权限/占用）不应中断整次扫描
      console.error(`扫描目录 ${currentPath} 出错:`, error)
      return
    }

    if (depth === maxDepth) {
      for (const entry of entries) {
        if (!entry.isFile() || !isImageFile(entry.name)) continue

        images.push({
          path: [...segments, entry.name].join('/'),
          absolutePath: join(currentPath, entry.name),
          name: entry.name,
        })
      }
      return
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (!validators[depth](entry.name)) continue

      await walk(join(currentPath, entry.name), depth + 1, [
        ...segments,
        entry.name,
      ])
    }
  }

  await walk(rootPath, 0, [])

  if (!images.length) {
    throw new Error('未找到符合条件的文件')
  }

  return { dirs, images }
}
