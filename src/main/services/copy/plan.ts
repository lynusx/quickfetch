import { readdir } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'

import type {
  CopyLayout,
  CopyTaskParams,
  ScannedImage,
} from '../../../shared/ipc'
import { DEFAULT_PREFERENCES } from '../../../shared/ipc'
import { isImageFile } from '../../../shared/imageExtensions'
import { toFsPath } from '../../utils/pathx'

/**
 * 复制计划：哪些图参与、每个落到哪个目录、叫什名字、动不动磁盘。
 *
 * 预检查（复制面板）与真正执行共用这一份结果 —— 以前 preview 用
 * countConflicts、执行用 buildPlan，两套「同名判定」可能给出不同结论。
 */

/**
 * 单个待复制项的执行意图。
 *
 * - copy：真的写盘
 * - skip-exists：目标目录里已有同名文件，按「跳过已存在」策略跳过这一张
 * - skip：本批内部同名且策略为跳过（源目录里就有重名，无处可放）
 *
 * 前两种都不碰磁盘，但要分开计数：用户看「跳过 50 张」时需要知道
 * 是"盘上本来就有"还是"源里重了"。
 */
export type PlanAction = 'copy' | 'skip' | 'skip-exists'

export interface PlanItem {
  image: ScannedImage
  /** 相对目标目录的文件夹，空数组表示根下 */
  folder: string[]
  from: string
  to: string
  renamed: boolean
  action: PlanAction
  /** 源文件大小；拿不到时为 undefined，进度按张数回退 */
  size?: number
}

export interface CopyPlan {
  /** 参与本次复制的图片（已按机台与图片扩展名过滤） */
  picked: ScannedImage[]
  /** 需要落盘或已在批内让名的项；目标已存在而跳过的项不在这里 */
  items: PlanItem[]
  /** 目标目录开工前已有同名、按策略跳过的张数 */
  alreadyExists: number
  /** items 里真正要写盘的张数 */
  copyTotal: number
  /** 按机台统计（预览用） */
  perMachine: { machine: string; images: number }[]
  /** 将要创建的分组目录（预览用） */
  folders: string[]
  /** 目标目录开工前已存在同名的坑位数；没给 targetDir 时为 0 */
  conflicts: number
}

const compareName = (a: string, b: string): number =>
  a.localeCompare(b, 'zh-CN', { numeric: true })

/**
 * 把文件名拆成「主名 + 末尾数字 + 扩展名」，用于数字自增。
 *
 * img.jpg      → { base: 'img',   index: null }
 * img1.jpg     → { base: 'img',   index: 1 }
 * shot_007.jpg → { base: 'shot_', index: 7 }  → 007 补零宽度保留
 */
const splitIndex = (
  name: string,
): { base: string; index: number | null; width: number; ext: string } => {
  const ext = extname(name)
  const stem = basename(name, ext)
  const match = stem.match(/^(.*?)(\d+)$/)

  if (!match) return { base: stem, index: null, width: 0, ext }

  const digits = match[2]

  return {
    base: match[1],
    index: Number.parseInt(digits, 10),
    width: digits.length,
    ext,
  }
}

/**
 * 生成不冲突的目标文件名：纯数字自增，直接拼在主名后面。
 *
 * img.jpg → img1.jpg → img2.jpg
 * img1.jpg 重名 → img2.jpg（拆开已有数字递增，不会得到 img11.jpg）
 *
 * Windows 文件名大小写不敏感，比较统一转小写，避免 a.jpg 与 A.jpg 互相覆盖。
 * 刻意不识别「img (2).jpg」这种带空格的副本名——重跑时它会当成另一个文件。
 */
const indexedName = (name: string, taken: Set<string>): string => {
  if (!taken.has(name.toLowerCase())) return name

  const { base, index, width, ext } = splitIndex(name)
  const start = (index ?? 0) + 1

  for (let next = start; next < start + 100_000; next += 1) {
    const digits = width > 1 ? String(next).padStart(width, '0') : String(next)
    const candidate = `${base}${digits}${ext}`

    if (!taken.has(candidate.toLowerCase())) return candidate
  }

  // 极端情况（同名上万份）：退回时间戳，绝不覆盖已有文件
  return `${base}${Date.now()}${ext}`
}

const segmentsOf = (image: ScannedImage): string[] =>
  image.path.split('/').filter(Boolean)

/**
 * 从图片上取机台与类型。
 *
 * 机台优先用扫描时写进去的 machine 字段 —— 力禧特、利珀、森标 AOI 的 path 第 0 段是厂区，
 * 直接按段切会把整个厂区当成一台机器。老历史记录没有这个字段，退回第 0 段
 * （那时的记录全是 EL 的，第 0 段就是机台目录名）。
 *
 * 类型取倒数第 2 段，各类扫描都一样。
 */
export const machineOf = (image: ScannedImage): string =>
  image.machine ?? segmentsOf(image)[0] ?? ''

export const typeOf = (image: ScannedImage): string => {
  const segments = segmentsOf(image)
  return segments.length >= 2 ? segments[segments.length - 2] : ''
}

/**
 * 按分组方式算出图片相对目标目录的子目录。
 * 完全平铺返回空数组，表示直接放进目标目录根下。
 */
export const folderOf = (image: ScannedImage, layout: CopyLayout): string[] => {
  switch (layout) {
    case 'flat':
      return []
    case 'machine':
      return [machineOf(image)]
    case 'type':
      return [typeOf(image)]
    case 'machine-type':
      return [machineOf(image), typeOf(image)]
  }
}

/**
 * 过滤出勾选的机台。
 *
 * 空数组表示一台都没选，返回空结果 —— 不再兼作「全选」。
 * 渲染层默认全选并显式传机台名，主进程不再猜调用方的意图。
 */
export const filterByMachines = (
  images: ScannedImage[],
  machines: string[],
): ScannedImage[] => {
  const allowed = new Set(machines)

  if (!allowed.size) return []

  return images.filter((image) => allowed.has(machineOf(image)))
}

/**
 * 参与复制的完整图片集合：勾选的机台 + 图片扩展名。
 *
 * 界面给的是「将复制 N 张图」，不该把手工放进类型目录的说明文件、表格
 * 一起算进去。扫描侧已经按同一套扩展名过滤过，这里再挡一次是为了兼容
 * 既有历史记录。所有入口（预览、执行、清单）都只走这一处。
 */
export const selectCopyImages = (
  images: ScannedImage[],
  machines: string[],
): ScannedImage[] =>
  filterByMachines(images, machines).filter((image) => isImageFile(image.name))

/** 取某目录的已占用名单，同一目录只读一次 */
const namesIn = async (
  dir: string,
  cache: Map<string, Set<string>>,
): Promise<Set<string>> => {
  const cached = cache.get(dir)

  if (cached) return cached

  const names = await existingNames(dir)
  cache.set(dir, names)

  return names
}

/** 读目标目录已有文件名；分组子目录还不存在时视为空 */
const existingNames = async (dir: string): Promise<Set<string>> => {
  try {
    const entries = await readdir(toFsPath(dir))

    return new Set(entries.map((name) => name.toLowerCase()))
  } catch {
    return new Set()
  }
}

export interface BuildCopyPlanInput {
  images: ScannedImage[]
  params: CopyTaskParams
  /**
   * 目标目录；不传时只统计张数/机台/分组（预览还没选目录的场景），
   * 不生成 plan 项、也不预演冲突。
   */
  targetDir?: string
}

/**
 * 建一份复制计划：一次遍历同时得到执行项与预览数字。
 *
 * 目标目录里有三种「同名」必须分开看：
 * - original 是目标目录「开工前」的快照，用来判断这个名字是不是本来就存在
 * - taken 是本批累积占用，用来排队编号
 * - handled 记录本批里每个「目录 + 源文件名」出现过几次
 *
 * 合成一个名单会出事：A02-A 下 9 张图都叫 img.jpg，第 1 张复制过去后名字
 * 就被占住了，后面 8 张会被判成「目标已存在」——skip 会全跳（丢 8 张），
 * overwrite 会让它们互相覆盖（也丢 8 张）。
 */
export const buildCopyPlan = async ({
  images,
  params,
  targetDir,
}: BuildCopyPlanInput): Promise<CopyPlan> => {
  const picked = selectCopyImages(images, params.machines)
  const perMachine = new Map<string, number>()
  const folders = new Set<string>()

  for (const image of picked) {
    const machine = machineOf(image)
    perMachine.set(machine, (perMachine.get(machine) ?? 0) + 1)

    const segments = folderOf(image, params.layout)
    if (segments.length) folders.add(segments.join('/'))
  }

  const summary = {
    picked,
    perMachine: [...perMachine.entries()]
      .map(([machine, count]) => ({ machine, images: count }))
      .sort((a, b) => compareName(a.machine, b.machine)),
    folders: [...folders].sort(compareName),
  }

  // 没选目录：预览只关心张数与分组，冲突与执行项都无从谈起
  if (!targetDir) {
    return {
      ...summary,
      items: [],
      alreadyExists: 0,
      copyTotal: picked.length,
      conflicts: 0,
    }
  }

  const conflict = params.conflict ?? DEFAULT_PREFERENCES.copyConflict
  const original = new Map<string, Set<string>>()
  const taken = new Map<string, Set<string>>()
  const handled = new Map<string, Set<string>>()
  /** 已经计入冲突的「目录 + 文件名」坑位；同一坑位只算一次 */
  const conflictSlots = new Set<string>()
  const items: PlanItem[] = []
  let alreadyExists = 0
  let conflicts = 0

  for (const image of picked) {
    const folder = folderOf(image, params.layout)
    const dir = folder.length ? join(targetDir, ...folder) : targetDir

    const existing = await namesIn(dir, original)

    let used = taken.get(dir)

    if (!used) {
      // 从原始快照复制一份，后续改的都是副本
      used = new Set(existing)
      taken.set(dir, used)
    }

    let seen = handled.get(dir)

    if (!seen) {
      seen = new Set()
      handled.set(dir, seen)
    }

    const lower = image.name.toLowerCase()
    const existedBefore = existing.has(lower)
    const repeated = seen.has(lower)

    seen.add(lower)

    // 预览口径：目标目录开工前就有同名的坑位数，与重名策略无关。
    // 同一批同名图只占一个坑位，只算一次。
    if (existedBefore) {
      const slot = `${dir}\u0000${lower}`

      if (!conflictSlots.has(slot)) {
        conflictSlots.add(slot)
        conflicts += 1
      }
    }

    let target = image.name
    let action: PlanAction = 'copy'

    // 三条判定互斥，顺序不能换：
    // 1) 目标开工前就有这个文件名 → 按用户选的策略走。skip 只跳这一张。
    //    以前这里是整组跳过，9 张 img.jpg 遇到 1 张已存在就丢 8 张。
    // 2) 本批内部重名（目标原本没有）→ 编号让开，skip 也跳。
    //    这一段保证 A02-A 下 9 张 img.jpg 不会互相覆盖，不能动。
    // 3) 其余照常复制。
    if (existedBefore && conflict === 'skip') {
      action = 'skip-exists'
    } else if (existedBefore && conflict === 'overwrite') {
      // 第一张顶掉目标文件，后面同名的编号落盘，否则 4 张最后只剩 1 张
      target = repeated ? indexedName(image.name, used) : image.name
    } else if (used.has(lower)) {
      if (conflict === 'skip') action = 'skip'
      else target = indexedName(image.name, used)
    }

    if (action === 'copy') used.add(target.toLowerCase())

    // 目标已存在而跳过的项不进 plan：它们不需要任何磁盘动作，
    // 混进 plan 只会把批号、进度和并发通道都算乱。
    if (action === 'skip-exists') {
      alreadyExists += 1
      continue
    }

    items.push({
      image,
      folder,
      from: image.absolutePath,
      to: join(dir, target),
      renamed: target !== image.name,
      action,
    })
  }

  return {
    ...summary,
    items,
    alreadyExists,
    copyTotal: items.filter((item) => item.action === 'copy').length,
    conflicts,
  }
}
