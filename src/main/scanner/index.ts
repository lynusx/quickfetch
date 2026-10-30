import { readdir } from 'node:fs/promises'
import { basename, join } from 'node:path'

import type {
  ScanImagesParams,
  ScanImagesResult,
  ScanProgress,
  ScannedImage,
} from '../../shared/ipc'

import { ScanError } from './errors'
import { createLimiter } from './limiter'

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])

/** 同时进行的 readdir 数量：本地盘收益有限，网络盘（DC 常挂在共享盘上）收益明显 */
const READ_CONCURRENCY = 8

/** 进度事件最小间隔，避免大目录下高频 IPC 把渲染进程压满 */
const PROGRESS_INTERVAL_MS = 100

const isImageFile = (name: string): boolean => {
  const dot = name.lastIndexOf('.')
  return dot > 0 && IMAGE_EXTENSIONS.has(name.slice(dot).toLowerCase())
}

/** 层级规则：目录结构的每一层由 label/expected 描述，match 决定候选目录是否命中 */
interface ScanLevel {
  label: string
  expected: string
  match: (name: string) => boolean
}

interface ScanNode {
  path: string
  segments: string[]
}

export interface ScanOptions {
  taskId: string
  signal?: AbortSignal
  onProgress?: (progress: ScanProgress) => void
}

const createAbortError = (): Error => {
  const error = new Error('扫描已取消')
  error.name = 'AbortError'
  return error
}

const isAbortError = (error: unknown): boolean =>
  error instanceof Error && error.name === 'AbortError'

/** 期望值过长时截断，避免错误文案撑满弹窗 */
const summarize = (values: string[], max = 6): string =>
  values.length > max
    ? `${values.slice(0, max).join('、')} 等 ${values.length} 项`
    : values.join('、')

/**
 * 6 层目录规则（与 DC 现场目录结构一致）：
 * 厂区子目录 → EL → 日期 → 班次 → 时段 → 类型 → 图片文件
 */
const createLevels = ({
  plant,
  date,
  shift,
  times,
  types,
}: Omit<ScanImagesParams, 'rootPath'>): ScanLevel[] => {
  const plantPattern = new RegExp(`^${plant}\\d+`)
  const timeSet = new Set(times)
  const typeSet = new Set(types)

  return [
    {
      label: '厂区',
      expected: `${plant}01、${plant}02…`,
      match: (name) => plantPattern.test(name),
    },
    { label: 'EL 层级', expected: 'EL', match: (name) => name === 'EL' },
    { label: '日期', expected: date, match: (name) => name === date },
    { label: '班次', expected: shift, match: (name) => name === shift },
    {
      label: '时段',
      expected: summarize(times),
      match: (name) => timeSet.has(name),
    },
    {
      label: '类型',
      expected: summarize(types),
      match: (name) => typeSet.has(name),
    },
  ]
}

/** 目录不存在、无权限等系统错误转成可读文案，避免只报「未找到符合条件的文件」 */
const toReadableError = (path: string, error: unknown): ScanError => {
  const code = (error as NodeJS.ErrnoException | undefined)?.code

  if (code === 'ENOENT') {
    return new ScanError(
      'PATH_NOT_FOUND',
      `目录不存在或已被移动：${path}，请重新选择`,
    )
  }

  if (code === 'EACCES' || code === 'EPERM') {
    return new ScanError(
      'PERMISSION_DENIED',
      `没有读取「${path}」的权限，请检查目录访问权限后重试`,
    )
  }

  return new ScanError(
    'PATH_NOT_FOUND',
    `无法访问「${path}」：${(error as Error)?.message ?? '未知错误'}`,
  )
}

export const scanImages = async (
  params: ScanImagesParams,
  options: ScanOptions,
): Promise<ScanImagesResult> => {
  const startedAt = Date.now()
  const { taskId, signal, onProgress } = options
  const { rootPath, plant, date, shift } = params

  if (basename(rootPath) !== 'DC') {
    throw new ScanError(
      'NOT_DC_DIRECTORY',
      `所选目录不是 DC 根目录（当前为「${basename(rootPath)}」），请选择名为 DC 的目录`,
    )
  }

  // 根目录单独校验，把「路径不存在」和「结构不符」区分开
  try {
    await readdir(rootPath, { withFileTypes: true })
  } catch (error) {
    throw toReadableError(rootPath, error)
  }

  const levels = createLevels(params)
  const limiter = createLimiter(READ_CONCURRENCY)

  let scannedDirs = 0
  let permissionHits = 0
  let lastProgressAt = 0
  const images: ScannedImage[] = []
  const plantDirs: string[] = []

  /** 记录最靠上的断链层级，用于精确报错（放在对象里避免闭包赋值被 TS 收窄成 never） */
  const gapRef: {
    current: { depth: number; level: ScanLevel; parent: string } | null
  } = {
    current: null,
  }

  const emitProgress = (currentPath: string, force = false): void => {
    if (!onProgress) return

    const now = Date.now()
    if (!force && now - lastProgressAt < PROGRESS_INTERVAL_MS) return

    lastProgressAt = now
    onProgress({
      taskId,
      scannedDirs,
      matched: images.length,
      currentPath,
      elapsedMs: now - startedAt,
    })
  }

  const recordGap = (depth: number, level: ScanLevel, parent: string): void => {
    const current = gapRef.current
    if (!current || depth < current.depth) {
      gapRef.current = { depth, level, parent }
    }
  }

  let frontier: ScanNode[] = [{ path: rootPath, segments: [] }]

  const walk = async (): Promise<void> => {
    for (let depth = 0; depth < levels.length; depth += 1) {
      const level = levels[depth]
      const next: ScanNode[] = []

      await Promise.all(
        frontier.map((parent) =>
          limiter(async () => {
            if (signal?.aborted) throw createAbortError()

            let entries
            try {
              entries = await readdir(parent.path, { withFileTypes: true })
            } catch (error) {
              const code = (error as NodeJS.ErrnoException | undefined)?.code
              if (code === 'EACCES' || code === 'EPERM') permissionHits += 1
              // 单个子目录不可读不应中断整次扫描，继续其它分支
              console.error(`扫描目录 ${parent.path} 出错:`, error)
              return
            }

            scannedDirs += 1

            const children = entries.filter(
              (entry) => entry.isDirectory() && level.match(entry.name),
            )

            if (depth === 0) {
              plantDirs.push(...children.map((child) => child.name))
            }

            if (!children.length) {
              recordGap(depth, level, parent.path)
              emitProgress(parent.path)
              return
            }

            for (const child of children) {
              next.push({
                path: join(parent.path, child.name),
                segments: [...parent.segments, child.name],
              })
            }

            emitProgress(parent.path)
          }),
        ),
      )

      if (!next.length) break
      frontier = next
    }

    // 最后一层（类型目录）之下才是图片文件
    await Promise.all(
      frontier.map((node) =>
        limiter(async () => {
          if (signal?.aborted) throw createAbortError()

          let entries
          try {
            entries = await readdir(node.path, { withFileTypes: true })
          } catch (error) {
            const code = (error as NodeJS.ErrnoException | undefined)?.code
            if (code === 'EACCES' || code === 'EPERM') permissionHits += 1
            console.error(`扫描目录 ${node.path} 出错:`, error)
            return
          }

          scannedDirs += 1

          for (const entry of entries) {
            if (!entry.isFile() || !isImageFile(entry.name)) continue

            images.push({
              path: [...node.segments, entry.name].join('/'),
              absolutePath: join(node.path, entry.name),
              name: entry.name,
            })
          }

          emitProgress(node.path)
        }),
      ),
    )
  }

  try {
    await walk()
  } catch (error) {
    if (!isAbortError(error)) throw error

    emitProgress('', true)

    // 取消属于正常流程，用 canceled 标记回传，不当作错误弹提示
    return {
      taskId,
      dirs: [],
      images: [],
      scannedDirs,
      elapsedMs: Date.now() - startedAt,
      canceled: true,
    }
  }

  emitProgress('', true)

  const elapsedMs = Date.now() - startedAt

  if (!images.length) {
    if (!plantDirs.length) {
      throw new ScanError(
        'NO_PLANT_DIRECTORY',
        `DC 目录下未找到 ${plant} 厂区的文件夹（如 ${plant}01、${plant}02），请确认厂区选择是否正确`,
      )
    }

    const gap = gapRef.current

    if (gap) {
      throw new ScanError(
        'STRUCTURE_MISMATCH',
        `「${gap.parent}」下未找到${gap.level.label}文件夹（期望：${gap.level.expected}），` +
          '请确认 DC 目录结构是否为 厂区/EL/日期/班次/时段/类型；' +
          `当前条件：日期 ${date}、班次 ${shift}`,
      )
    }

    if (permissionHits && scannedDirs <= permissionHits) {
      throw new ScanError(
        'PERMISSION_DENIED',
        '没有读取 DC 下目录的权限，请检查目录访问权限后重试',
      )
    }

    throw new ScanError(
      'NO_MATCHED_IMAGES',
      `已扫描 ${scannedDirs} 个目录，未找到图片文件；` +
        `请确认日期 ${date}、班次 ${shift} 以及所选时段/类型下是否已有图片`,
    )
  }

  return {
    taskId,
    dirs: [...new Set(plantDirs)].sort((a, b) => a.localeCompare(b)),
    images,
    scannedDirs,
    elapsedMs,
    canceled: false,
  }
}
