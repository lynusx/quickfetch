import type {
  AppSettings,
  LxtShare,
  Plant,
  ScanCategory,
  ScanTask,
  ScanTaskParams,
  ShareState,
} from '../../shared/ipc'
import { DEFAULT_AOI_IMAGE_KIND, elPlantOf } from '../../shared/ipc'
import {
  createAoiResolver,
  createElResolver,
  createLxtResolver,
  createPlResolver,
} from '../services/scanner/resolver'
import type { MachineResolver } from '../services/scanner/resolver'
import {
  createTask,
  getRunner,
  getTask,
  startTask,
  taskImagePage,
} from '../services/scanner'
import {
  readSettings,
  rememberLxtShare,
  rememberPlShare,
  loadFrom,
} from '../services/settings'
import { handle } from './handle'

const requireRunner = (taskId: string) => {
  const runner = getRunner(taskId)

  if (!runner) {
    throw new Error('任务不存在或已被清理，请重新创建扫描任务')
  }

  return runner
}

/** 「厂区/机台」复合键的第一段就是厂区；无斜杠时视为未知 */
const keyPlantOf = (key: string): Plant | null => {
  const index = key.indexOf('/')
  return index === -1 ? null : key.slice(0, index)
}

/**
 * 同一次扫描只能选一个厂区。
 *
 * 渲染层已经按厂区互斥，这里再挡一道：历史记录、旧配置或其它调用方
 * 仍可能送来东、西区混在一起的机台列表，混扫会让进度与复制分组都失去意义。
 */
const assertSinglePlant = (plants: (Plant | null | undefined)[]): void => {
  const distinct = new Set(
    plants.filter((plant): plant is Plant => Boolean(plant)),
  )

  if (distinct.size > 1) {
    throw new Error(
      '同一次扫描只能选择一个厂区（东区或西区）的机台，请取消另一区的勾选',
    )
  }
}

const validateParams = (params: ScanTaskParams): void => {
  if (!params.machines.length) {
    throw new Error('请至少选择一个机台')
  }
  if (!/^\d{8}$/.test(params.date)) {
    throw new Error('日期格式不正确，应为 YYYYMMDD')
  }
  // 森标 AOI 的路径没有时段层，允许传空数组
  if ((params.category ?? 'el') !== 'aoi' && !params.slots.length) {
    throw new Error('请至少选择一个时段')
  }
  if (!params.types.length) {
    throw new Error('请至少选择一个不良类型')
  }
}

interface EntryMachine {
  key: string
  host: string
  stale: boolean
}

interface EntryTaskOptions {
  category: 'lxt' | 'pl' | 'aoi'
  settings: AppSettings
  params: ScanTaskParams
  active: EntryMachine[]
  buildResolver: (hosts: Map<string, string>) => MachineResolver
  /** 覆盖参数里的时段；森标 AOI 固定清空 */
  slots?: string[]
}

/**
 * 入口类扫描任务的共同装配：过滤已知机台、厂区互斥、host 表、createTask。
 * 解析器由各 category 的 adapter 构造，差异不泄漏到装配流程。
 */
const createEntryTask = ({
  category,
  settings,
  params,
  active,
  buildResolver,
  slots = params.slots,
}: EntryTaskOptions): ScanTask => {
  const known = new Set(active.map((item) => item.key))
  const machines = params.machines.filter((key) => known.has(key))

  if (!machines.length) {
    throw new Error('所选机台已不在入口目录中，请点击「重新识别」刷新机台列表')
  }

  assertSinglePlant(machines.map(keyPlantOf))

  const hosts = new Map(active.map((item) => [item.key, item.host]))
  const resolver = buildResolver(hosts)

  return createTask(
    { ...params, category, machines, slots },
    {
      category,
      resolver,
      load: loadFrom(settings.preferences),
    },
  )
}

const createLxtTask = (
  settings: AppSettings,
  params: ScanTaskParams,
): ScanTask => {
  const active = settings.lxt.machines.filter((item) => !item.stale)
  const shares = new Map<string, ShareState<LxtShare>>(
    active.map((item) => [item.key, item.share]),
  )

  return createEntryTask({
    category: 'lxt',
    settings,
    params,
    active,
    buildResolver: (hosts) =>
      createLxtResolver({
        hosts,
        shares,
        date: params.date,
        onShare: (machine, share, host) => {
          void rememberLxtShare(machine, share, host)
        },
      }),
  })
}

const createPlTask = (
  settings: AppSettings,
  params: ScanTaskParams,
): ScanTask => {
  const active = settings.pl.machines.filter((item) => !item.stale)
  const shares = new Map<string, ShareState>(
    active.map((item) => [item.key, item.share]),
  )

  return createEntryTask({
    category: 'pl',
    settings,
    params,
    active,
    buildResolver: (hosts) =>
      createPlResolver({
        hosts,
        shares,
        date: params.date,
        onShare: (machine, share, host) => {
          void rememberPlShare(machine, share, host)
        },
      }),
  })
}

const createAoiTask = (
  settings: AppSettings,
  params: ScanTaskParams,
): ScanTask => {
  // 老记录或调用方传了不认识的值时按整张扫描图处理，不要因此拒绝扫描
  const imageKind =
    params.aoiImageKind === 'partial' ? 'partial' : DEFAULT_AOI_IMAGE_KIND

  return createEntryTask({
    category: 'aoi',
    settings,
    // 把归一化后的图片类型写回参数：历史记录里永远带着「这次实际读了哪个目录」，
    // 恢复时不必再猜老记录缺字段该怎么补
    params: { ...params, aoiImageKind: imageKind },
    active: settings.aoi.machines.filter((item) => !item.stale),
    // 森标 AOI 没有时段层，强制清空，避免调用方误传后多探一层目录
    slots: [],
    buildResolver: (hosts) => createAoiResolver({ hosts, imageKind }),
  })
}

const createElTask = (
  settings: AppSettings,
  params: ScanTaskParams,
): ScanTask => {
  if (!settings.rootPath) {
    throw new Error('尚未配置 DC 根目录，请先填写或选择根目录路径')
  }

  const known = new Set(settings.machines.map((item) => item.name))
  const machines = params.machines.filter((name) => known.has(name))

  if (!machines.length) {
    throw new Error('所选机台已不存在，请点击「重新识别」刷新机台列表')
  }

  const plantByName = new Map(
    settings.machines.map((item) => [item.name, item.plant]),
  )
  assertSinglePlant(
    machines.map((name) => plantByName.get(name) ?? elPlantOf(name)),
  )

  const resolver = createElResolver(settings.rootPath, settings.entry)

  return createTask(
    { ...params, category: 'el', machines },
    {
      category: 'el',
      resolver,
      load: loadFrom(settings.preferences),
    },
  )
}

/** 类别 → 建任务函数；加一类只在这里补一项，类型检查保证不漏 */
const taskBuilders = {
  el: createElTask,
  lxt: createLxtTask,
  pl: createPlTask,
  aoi: createAoiTask,
} satisfies Record<
  ScanCategory,
  (settings: AppSettings, params: ScanTaskParams) => ScanTask
>

export const registerScanIpc = (): void => {
  handle('scan:create', async (_event, params: ScanTaskParams) => {
    validateParams(params)
    const settings = await readSettings()
    const category = params.category ?? 'el'

    return taskBuilders[category](settings, params)
  })

  // 启动走 registry.startTask：它在任务结束后负责把结果写入历史
  handle('scan:start', (_event, taskId: string): ScanTask => {
    const task = startTask(taskId)

    if (!task) throw new Error('任务不存在或已过期，请重新开始扫描')

    return task
  })

  handle('scan:pause', (_event, taskId: string) =>
    requireRunner(taskId).pause('user'),
  )

  handle('scan:resume', (_event, taskId: string) =>
    requireRunner(taskId).resume(),
  )

  handle('scan:cancel', (_event, taskId: string) =>
    requireRunner(taskId).cancel(),
  )

  handle('scan:get', (_event, taskId: string) => getTask(taskId))

  handle(
    'scan:images',
    (_event, taskId: string, offset: number, limit: number) =>
      taskImagePage(taskId, offset, limit),
  )
}
