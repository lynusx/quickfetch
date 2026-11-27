import type {
  AppSettings,
  LxtShare,
  Plant,
  ScanCategory,
  ScanTaskParams,
  ShareState,
} from '../../../shared/ipc'
import { DEFAULT_AOI_IMAGE_KIND, elPlantOf } from '../../../shared/ipc'
import { normalizeScanCategory } from '../../../shared/scanCategories'
import { ENTRY, loadFrom, rememberCategoryShare } from '../settings'
import {
  createAoiResolver,
  createElResolver,
  createLxtResolver,
  createPlResolver,
} from './resolver'
import type { MachineResolver } from './resolver'
import type { TaskContext } from './task'

/**
 * 扫描任务装配：参数校验、已知非 stale 机台过滤、单厂区互斥约束、
 * AOI 图片类型/空时段归一化与类别 resolver 组装。
 *
 * 从 IPC 层下沉至此并支持注入 `onRememberShare`，使四类扫描的完整建任务约束
 * 可脱离 Electron 直接通过纯输入输出验证。
 */

export interface PreparedScanTask {
  params: ScanTaskParams
  context: TaskContext
}

export interface PrepareScanTaskOptions {
  onRememberShare?: (
    category: 'lxt' | 'pl',
    machine: string,
    share: ShareState,
    host: string,
  ) => void
}

const keyPlantOf = (key: string): Plant | null => {
  const index = key.indexOf('/')
  return index === -1 ? null : key.slice(0, index)
}

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

export const validateScanTaskParams = (params: ScanTaskParams): void => {
  if (!params.machines.length) {
    throw new Error('请至少选择一个机台')
  }
  if (!/^\d{8}$/.test(params.date)) {
    throw new Error('日期格式不正确，应为 YYYYMMDD')
  }
  if (
    normalizeScanCategory(params.category) !== 'aoi' &&
    !params.slots.length
  ) {
    throw new Error('请至少选择一个时段')
  }
  if (!params.types.length) {
    throw new Error('请至少选择一个不良类型')
  }
}

interface ActiveEntryMachine {
  key: string
  host: string
  stale: boolean
}

const prepareEntryCategory = (
  category: 'lxt' | 'pl' | 'aoi',
  settings: AppSettings,
  params: ScanTaskParams,
  active: ActiveEntryMachine[],
  buildResolver: (hosts: Map<string, string>) => MachineResolver,
  slots = params.slots,
): PreparedScanTask => {
  const known = new Set(active.map((item) => item.key))
  const machines = params.machines.filter((key) => known.has(key))

  if (!machines.length) {
    throw new Error('所选机台已不在入口目录中，请点击「重新识别」刷新机台列表')
  }

  assertSinglePlant(machines.map(keyPlantOf))

  const hosts = new Map(active.map((item) => [item.key, item.host]))

  return {
    params: { ...params, category, machines, slots },
    context: {
      category,
      resolver: buildResolver(hosts),
      load: loadFrom(settings.preferences),
    },
  }
}

export const prepareScanTask = (
  settings: AppSettings,
  rawParams: ScanTaskParams,
  options: PrepareScanTaskOptions = {},
): PreparedScanTask => {
  validateScanTaskParams(rawParams)

  const category: ScanCategory = normalizeScanCategory(rawParams.category)
  const onRememberShare =
    options.onRememberShare ??
    ((cat, machine, share, host) => {
      void rememberCategoryShare(cat, machine, share, host)
    })

  if (category === 'el') {
    const el = settings.categories.el
    if (!el.entryRoot) {
      throw new Error('尚未配置 DC 根目录，请先填写或选择根目录路径')
    }

    const known = new Set(el.machines.map((item) => item.name))
    const machines = rawParams.machines.filter((name) => known.has(name))

    if (!machines.length) {
      throw new Error('所选机台已不存在，请点击「重新识别」刷新机台列表')
    }

    const plantByName = new Map(
      el.machines.map((item) => [item.name, item.plant]),
    )
    assertSinglePlant(
      machines.map((name) => plantByName.get(name) ?? elPlantOf(name)),
    )

    return {
      params: { ...rawParams, category: 'el', machines },
      context: {
        category: 'el',
        resolver: createElResolver(el.entryRoot, ENTRY),
        load: loadFrom(settings.preferences),
      },
    }
  }

  if (category === 'lxt') {
    const active = settings.categories.lxt.machines.filter(
      (item) => !item.stale,
    )
    const shares = new Map<string, ShareState<LxtShare>>(
      active.map((item) => [item.key, item.share]),
    )

    return prepareEntryCategory('lxt', settings, rawParams, active, (hosts) =>
      createLxtResolver({
        hosts,
        shares,
        date: rawParams.date,
        onShare: (machine, share, host) =>
          onRememberShare('lxt', machine, share, host),
      }),
    )
  }

  if (category === 'pl') {
    const active = settings.categories.pl.machines.filter((item) => !item.stale)
    const shares = new Map<string, ShareState>(
      active.map((item) => [item.key, item.share]),
    )

    return prepareEntryCategory('pl', settings, rawParams, active, (hosts) =>
      createPlResolver({
        hosts,
        shares,
        date: rawParams.date,
        onShare: (machine, share, host) =>
          onRememberShare('pl', machine, share, host),
      }),
    )
  }

  const imageKind =
    rawParams.aoiImageKind === 'partial' ? 'partial' : DEFAULT_AOI_IMAGE_KIND
  const active = settings.categories.aoi.machines.filter((item) => !item.stale)

  return prepareEntryCategory(
    'aoi',
    settings,
    { ...rawParams, aoiImageKind: imageKind },
    active,
    (hosts) => createAoiResolver({ hosts, imageKind }),
    [],
  )
}
