import { copyFile, mkdir, readdir, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'

import type {
  CopyFailure,
  CopyLayout,
  CopyPlanPreview,
  CopyProgress,
  CopyTask,
  CopyTaskParams,
  ScannedImage,
} from '../shared/ipc'

import { createAdaptiveGate } from './adaptive'
import type { AdaptiveGate } from './adaptive'
import { toFsPath } from './pathx'

/**
 * 同时打开的文件句柄上限。现场机器 8G 内存，10 路并发复制 +
 * 每个目标先 stat 一次会瞬时占用 20 个句柄，遇到网络盘共享冲突就开始失败，
 * 所以降到 6，并以每批 50 个文件的粒度推进。
 */
export const DEFAULT_COPY_CONCURRENCY = 6

/** 每批复制的文件数：批与批之间让出事件循环，进度也能按批反馈 */
export const DEFAULT_COPY_BATCH_SIZE = 50

const PROGRESS_INTERVAL_MS = 120

const MANIFEST_NAME = 'source.txt'

export interface CopyLoadOptions {
  concurrency?: number
  batchSize?: number
}

const abortError = (): Error => {
  const error = new Error('复制已取消')
  error.name = 'AbortError'
  return error
}

const isAbortError = (error: unknown): boolean =>
  error instanceof Error && error.name === 'AbortError'

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
 * 刻意不识别旧版本生成的「img (2).jpg」——跨版本重跑时它会当成另一个文件。
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
 * 从图片的相对路径里取出机台与类型。
 *
 * 结构是「机台/EL/日期/班次/时段/类型/文件名」，所以机台取第 0 段、
 * 类型取倒数第 2 段。路径分隔符统一为 /（扫描时就写入的），
 * 历史记录里的旧数据也是这个格式。
 */
export const machineOf = (image: ScannedImage): string =>
  segmentsOf(image)[0] ?? ''

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

/** 过滤出勾选的机台；machines 为空表示全选 */
export const filterByMachines = (
  images: ScannedImage[],
  machines: string[],
): ScannedImage[] => {
  if (!machines.length) return images

  const allowed = new Set(machines)

  return images.filter((image) => allowed.has(machineOf(image)))
}

const compareName = (a: string, b: string): number =>
  a.localeCompare(b, 'zh-CN', { numeric: true })

/** 预检查：让界面在选目录前就能告诉用户会复制多少、建几个文件夹 */
export const planPreview = async (
  images: ScannedImage[],
  params: CopyTaskParams,
  targetDir?: string,
): Promise<CopyPlanPreview> => {
  const picked = filterByMachines(images, params.machines)
  const perMachine = new Map<string, number>()
  const folders = new Set<string>()

  for (const image of picked) {
    const machine = machineOf(image)
    perMachine.set(machine, (perMachine.get(machine) ?? 0) + 1)

    const segments = folderOf(image, params.layout)
    if (segments.length) folders.add(segments.join('/'))
  }

  // 只有已经选好目录才可能算冲突数；没选目录时分组子目录还不存在
  const conflicts = targetDir
    ? await countConflicts(picked, params, targetDir)
    : 0

  return {
    machines: [...perMachine.keys()].sort(compareName),
    total: picked.length,
    perMachine: [...perMachine.entries()]
      .map(([machine, images]) => ({ machine, images }))
      .sort((a, b) => compareName(a.machine, b.machine)),
    folders: [...folders].sort(compareName),
    conflicts,
  }
}

/**
 * 预演一遍重名冲突：按目标目录统计会被改名 / 跳过 / 覆盖的张数。
 *
 * 与 buildPlan 用同一套占用名单逻辑，保证预览数字和实际执行一致 ——
 * 两处各写一套的话，界面说「1 张会改名」而实际改了 3 张，比不提示更糟。
 */
/**
 * 预演一遍重名冲突：统计目标目录里**已经真实存在**同名文件的张数。
 *
 * 刻意不把「同一批里两张图同名」算进来 —— 那是源目录里的重名，
 * 用户在扫描结果里就能看到，提示「目标已存在」会让人误以为盘上已有文件。
 */
const countConflicts = async (
  images: ScannedImage[],
  params: CopyTaskParams,
  targetDir: string,
): Promise<number> => {
  const takenByDir = new Map<string, Set<string>>()
  let conflicts = 0

  for (const image of images) {
    const folder = folderOf(image, params.layout)
    const dir = folder.length ? join(targetDir, ...folder) : targetDir
    const taken = await namesIn(dir, takenByDir)

    if (taken.has(image.name.toLowerCase())) conflicts += 1
  }

  return conflicts
}

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

/** 单个待复制项的执行意图 */
type PlanAction = 'copy' | 'skip'

interface PlanItem {
  image: ScannedImage
  /** 相对目标目录的文件夹，空数组表示根下 */
  folder: string[]
  from: string
  to: string
  renamed: boolean
  action: PlanAction
}

export interface CopyRunnerOptions {
  scanTaskId: string
  targetDir: string
  params: CopyTaskParams
  images: ScannedImage[]
  emit: (task: CopyTask) => void
  load?: CopyLoadOptions
}

/**
 * 一次复制任务的执行体。
 *
 * 与扫描任务的差异：复制是逐文件 IO，单个文件失败不该中断整批，
 * 所以失败只记录不抛出；而暂停/取消要在文件之间生效，不能等整批跑完。
 */
export class CopyTaskRunner {
  readonly id = crypto.randomUUID()
  /** 创建时间，任务表按它淘汰最老的已结束任务 */
  readonly createdAt = Date.now()
  scanTaskId: string
  targetDir: string
  private params: CopyTaskParams

  private readonly source: ScannedImage[]
  private readonly emit: (task: CopyTask) => void
  private concurrency: number
  private readonly batchSize: number
  /** 失败率采样器，与扫描共用同一套降档逻辑 */
  private readonly gate: AdaptiveGate

  private status: CopyTask['status'] = 'pending'
  private error: string | null = null
  private manifestPath: string | null = null

  private plan: PlanItem[] = []
  private cursor = 0
  private copied = 0
  private renamed = 0
  private skipped = 0
  private failures: CopyFailure[] = []
  private currentPath = ''
  private startedAt: number | null = null
  private finishedAt: number | null = null
  private lastEmitAt = 0

  private paused = false
  private resumeWaiters: (() => void)[] = []
  /**
   * 每次 run 重新创建：取消过的信号会一直是 aborted，
   * 重试或换目录重跑时沿用它会让任务一启动就自己取消。
   */
  private abortController = new AbortController()
  private readonly settled: Promise<void>
  private markSettled: () => void = () => {}

  constructor(options: CopyRunnerOptions) {
    this.scanTaskId = options.scanTaskId
    this.targetDir = options.targetDir
    this.params = options.params
    this.source = options.images
    this.emit = options.emit
    this.concurrency = Math.max(
      1,
      Math.floor(options.load?.concurrency ?? DEFAULT_COPY_CONCURRENCY),
    )
    this.batchSize = Math.max(
      1,
      Math.floor(options.load?.batchSize ?? DEFAULT_COPY_BATCH_SIZE),
    )

    this.gate = createAdaptiveGate({
      initial: this.concurrency,
      min: 1,
      onChange: (concurrency, ratio) => {
        this.concurrency = concurrency

        console.warn(
          `复制失败率 ${(ratio * 100).toFixed(0)}%，并发降至 ${concurrency}`,
        )

        this.touch('', true)
      },
    })

    this.settled = new Promise<void>((resolve) => {
      this.markSettled = resolve
    })
  }

  // ---------------------------------------------------------------- 对外操作

  start(): CopyTask {
    if (this.status !== 'pending') return this.snapshot()

    this.status = 'running'
    this.startedAt = Date.now()
    this.touch('', true)
    void this.run()

    return this.snapshot()
  }

  pause(): CopyTask {
    if (this.status !== 'running') return this.snapshot()

    this.paused = true
    this.status = 'paused'
    this.touch('', true)

    return this.snapshot()
  }

  resume(): CopyTask {
    if (this.status !== 'paused') return this.snapshot()

    this.paused = false
    this.status = 'running'

    for (const resolve of this.resumeWaiters.splice(0)) resolve()

    this.touch('', true)

    return this.snapshot()
  }

  cancel(): CopyTask {
    if (this.isFinal()) return this.snapshot()

    this.abortController.abort()
    this.paused = false

    for (const resolve of this.resumeWaiters.splice(0)) resolve()

    this.status = 'canceled'
    this.touch('', true)

    return this.snapshot()
  }

  /** 只重试失败的图片；已成功的不会重来 */
  retry(): CopyTask {
    if (!this.isFinal()) return this.snapshot()
    if (!this.failures.length) return this.snapshot()

    // 把失败项换回待复制队列，其余计数归零
    this.plan = this.failures.map((failure) => ({
      image: {
        path: failure.path,
        absolutePath: failure.from,
        name: failure.path.split('/').pop() ?? failure.path,
      },
      folder: [],
      from: failure.from,
      to: failure.to,
      renamed: false,
      action: 'copy',
    }))
    this.cursor = 0
    this.copied = 0
    this.renamed = 0
    this.skipped = 0
    this.failures = []
    this.finishedAt = null
    this.error = null
    this.status = 'running'
    this.startedAt = Date.now()
    this.touch('', true)
    void this.run()

    return this.snapshot()
  }

  /**
   * 换一个目标目录，按最初勾选的机台与分组方式完整重跑一次。
   *
   * 已经在跑的任务不允许改目录 —— 一半文件在 A 一半在 B，事后没人能说清。
   */
  retargetTo(targetDir: string): CopyTask {
    if (!this.isFinal()) {
      throw new Error('复制正在进行，请先取消再更换目标目录')
    }
    if (!targetDir.trim()) throw new Error('目标目录不能为空')
    if (targetDir === this.targetDir) return this.snapshot()

    this.targetDir = targetDir
    this.plan = []
    this.cursor = 0
    this.copied = 0
    this.renamed = 0
    this.skipped = 0
    this.failures = []
    this.error = null
    this.manifestPath = null
    this.currentPath = ''
    this.finishedAt = null
    this.startedAt = Date.now()
    this.status = 'running'
    this.touch('', true)
    void this.run()

    return this.snapshot()
  }

  snapshot(): CopyTask {
    return {
      id: this.id,
      scanTaskId: this.scanTaskId,
      status: this.status,
      progress: this.progress(),
      error: this.error,
      // 失败明细带上限：几万条全塞进 IPC 会拖垮渲染层。
      // 批量失败通常发生在网络断开，前 200 条足够定位问题。
      failures: this.failures.slice(0, 200),
      manifestPath: this.manifestPath,
    }
  }

  isFinal(): boolean {
    return (
      this.status === 'completed' ||
      this.status === 'canceled' ||
      this.status === 'failed'
    )
  }

  waitSettled(): Promise<void> {
    return this.settled
  }

  // ---------------------------------------------------------------- 执行主体

  private progress(): CopyProgress {
    const total = this.plan.length
    // 跳过的也是「处理完了」：它已经比对过目标目录并做出了决定，
    // 只是没落盘。把它排除在分母外会让进度条永远差一截，
    // 全是跳过时甚至停在 0%，用户会以为任务卡住了。
    const done = this.copied + this.failures.length + this.skipped
    const elapsed = Math.max(
      0,
      (this.finishedAt ?? Date.now()) - (this.startedAt ?? Date.now()),
    )
    const ratio = total > 0 ? Math.min(1, done / total) : 0
    const batchTotal = total > 0 ? Math.ceil(total / this.batchSize) : 0

    return {
      status: this.status,
      copied: this.copied,
      total,
      failed: this.failures.length,
      batchIndex:
        batchTotal > 0
          ? Math.min(Math.max(1, Math.ceil(done / this.batchSize)), batchTotal)
          : 0,
      batchTotal,
      targetDir: this.targetDir,
      layout: this.params.layout,
      renamed: this.renamed,
      skipped: this.skipped,
      conflict: this.params.conflict ?? 'rename',
      currentPath: this.currentPath,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      elapsedMs: elapsed,
      // 进度过 10% 后估算才稳，否则刚开始会跳出一个很大的数
      etaMs:
        this.status === 'running' && ratio > 0.1 && ratio < 1
          ? Math.round((elapsed / ratio) * (1 - ratio))
          : null,
    }
  }

  private async run(): Promise<void> {
    // 新一轮执行必须用干净的中断信号，否则「取消后再重试/换目录」会秒退
    this.abortController = new AbortController()

    try {
      // 首次执行才做规划；重试时 plan 已经是失败项的子集
      if (!this.plan.length) {
        await this.buildPlan()
      }

      if (!this.plan.length) {
        this.finish('completed')

        return
      }

      await this.writeManifest()
      await this.createFolders()
      await this.copyAll()

      this.finish('completed')
    } catch (error) {
      if (isAbortError(error)) {
        this.finish('canceled')
      } else {
        this.error = (error as Error)?.message ?? '复制过程中发生未知错误'
        this.finish('failed')
      }
    }
  }

  private finish(status: CopyTask['status']): void {
    this.finishedAt = Date.now()
    this.status = status
    this.currentPath = ''
    this.touch('', true)
    this.markSettled()
  }

  /** 规划目标路径：按布局建子目录，按重名策略决定改名 / 跳过 / 覆盖 */
  private async buildPlan(): Promise<void> {
    const picked = filterByMachines(this.source, this.params.machines)
    const conflict = this.params.conflict ?? 'rename'

    // 每个目标目录一份已占用名单，跨批累积，保证同次任务内不重名
    const taken = new Map<string, Set<string>>()

    for (const image of picked) {
      const folder = folderOf(image, this.params.layout)
      const dir = folder.length
        ? join(this.targetDir, ...folder)
        : this.targetDir

      const names = await namesIn(dir, taken)
      const exists = names.has(image.name.toLowerCase())

      // 三种策略只在「目标已存在」时才有区别，否则一律原样复制
      let target = image.name
      let action: PlanAction = 'copy'

      if (exists) {
        if (conflict === 'skip') {
          action = 'skip'
        } else if (conflict === 'overwrite') {
          target = image.name
        } else {
          target = indexedName(image.name, names)
        }
      }

      names.add(target.toLowerCase())

      this.plan.push({
        image,
        folder,
        from: image.absolutePath,
        to: join(dir, target),
        renamed: target !== image.name,
        action,
      })
    }
  }

  private async createFolders(): Promise<void> {
    const folders = new Set(
      this.plan.map((item) => item.folder.join('/')).filter(Boolean),
    )

    for (const folder of folders) {
      const dir = join(this.targetDir, ...folder.split('/'))

      try {
        await mkdir(toFsPath(dir), { recursive: true })
      } catch (error) {
        throw new Error(
          `无法创建目录「${dir}」：${(error as Error)?.message ?? '未知错误'}`,
        )
      }
    }
  }

  /**
   * 清单写在目标目录根下，内容是参与这次复制的相对路径。
   * 分组复制时也放根下 —— 跟着某个机台子目录走会让用户找不到。
   */
  private async writeManifest(): Promise<void> {
    const target = join(this.targetDir, MANIFEST_NAME)

    try {
      await mkdir(toFsPath(this.targetDir), { recursive: true })
      await writeFile(
        toFsPath(target),
        this.plan.map((item) => item.image.path).join('\n'),
        'utf-8',
      )
      this.manifestPath = target
    } catch {
      // 清单只是辅助信息，写不进去不该让整次复制失败
      this.manifestPath = null
    }
  }

  private async copyAll(): Promise<void> {
    const total = this.plan.length

    // 外层按批推进只为让 progress 的批号有意义，真正的并发控制交给 pool
    while (this.cursor < total) {
      const batchEnd = Math.min(this.cursor + this.batchSize, total)
      const batch = this.plan.slice(this.cursor, batchEnd)

      await this.pool(batch, (item) => this.copyOne(item))

      this.cursor = batchEnd
      this.touch('', true)
    }
  }

  private async copyOne(item: PlanItem): Promise<void> {
    await this.checkpoint()

    // 跳过项不碰磁盘，直接计数
    if (item.action === 'skip') {
      this.skipped += 1
      this.gate.sample(false)
      this.touch(item.to)

      return
    }

    this.currentPath = item.to

    try {
      await copyFile(toFsPath(item.from), toFsPath(item.to))

      this.copied += 1
      if (item.renamed) this.renamed += 1
      this.gate.sample(false)
    } catch (error) {
      // 源文件被占用、权限不足、磁盘满等：记录后继续，不中断整批；
      // 但取消要立刻传播，不能被当成普通失败吞掉
      if (isAbortError(error)) throw error

      this.failures.push({
        path: item.image.path,
        from: item.from,
        to: item.to,
        reason: (error as Error)?.message ?? '未知错误',
      })

      // 失败率过高时降档：共享盘抖动下越并发越糟
      this.gate.sample(true)
    } finally {
      this.touch(item.to)
    }
  }

  private touch(currentPath: string, force = false): void {
    if (currentPath) this.currentPath = currentPath

    const now = Date.now()
    if (!force && now - this.lastEmitAt < PROGRESS_INTERVAL_MS) return

    this.lastEmitAt = now
    this.emit(this.snapshot())
  }

  /** 暂停/取消检查点：遍历待办项与每个文件粘贴前都会经过这里 */
  private async checkpoint(): Promise<void> {
    if (this.abortController.signal.aborted) throw abortError()

    while (this.paused) {
      await new Promise<void>((resolve) => {
        this.resumeWaiters.push(resolve)
      })
    }

    if (this.abortController.signal.aborted) throw abortError()
  }

  /**
   * 带并发上限执行，支持中途暂停。
   *
   * 不用「每批 slice + Promise.all」：那样暂停只能在批与批之间生效，
   * 一批 50 个文件要等一整批跑完才停，用户会以为暂停坏了。
   * 这里改成「谁先空出来谁领下一个」，暂停时立刻停止派发新任务，
   * 已在途的文件跑完后计数冻结。
   */
  private async pool(
    items: PlanItem[],
    worker: (item: PlanItem) => Promise<void>,
  ): Promise<void> {
    let next = 0

    const lanes = Array.from(
      { length: Math.min(this.concurrency, items.length) },
      async () => {
        while (next < items.length) {
          await this.checkpoint()

          // 暂停期间不领新活；恢复后接着从 next 走
          if (this.paused) continue

          const index = next
          next += 1

          await worker(items[index])
        }
      },
    )

    await Promise.all(lanes)
  }
}
