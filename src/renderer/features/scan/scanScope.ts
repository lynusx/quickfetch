import { useShallow } from 'zustand/react/shallow'
import { create } from 'zustand'
import type { StateStorage } from 'zustand/middleware'
import { createJSONStorage, devtools, persist } from 'zustand/middleware'

import type {
  AoiImageKind,
  AoiSide,
  AppSettings,
  Plant,
  ScanCategory,
  ScanHistoryItem,
  ScanTaskParams,
} from '@shared/ipc'
import {
  AOI_IMAGE_KIND_LABEL,
  aoiSideOfKey,
  aoiSideOfMachines,
  aoiSideOfName,
  DEFAULT_AOI_IMAGE_KIND,
  elPlantOf,
  PL_LEVELS,
  plantLabel,
} from '@shared/ipc'
import { SCAN_CATEGORY_META } from '@shared/scanCategories'

import {
  getAllAvailableTimes,
  getAllPaddedTimes,
  getShiftInfo,
} from '../../utils/common'
import type { PickableMachine } from './components/plant-machine-model'
import {
  compareMachineName,
  compareNatural,
  defaultSelectedKeys,
  pickableMachinesFromSettings,
} from './components/plant-machine-model'

/**
 * Scan Scope（扫描范围）：单一类别的筛选状态、意图动作与统一派生投影。
 *
 * 把 store、默认播种（日期/班次/时段、利珀等级、首厂区非 LX 机台）、
 * 用户显式切换（切班次、切厂区、切 AOI 检测面）、历史原子回填、
 * 目录/类型清单裁剪、`Scope Summary Bar` 摘要与扫描参数派生收拢在同一
 * seam 之后，消除 JSX `useEffect` / `useLayoutEffect` 对状态的隐式回写。
 */

export interface ScanScopeState {
  plant: Plant
  keyword: string
  selectedMachines: string[]
  date: string
  shift: '白班' | '夜班'
  slots: string[]
  types: string[]
  levels: string[]
  imageKind: AoiImageKind
  side: AoiSide
}

/** 页面与摘要条只订阅影响扫描范围的字段；机台搜索词与检测面过滤不触发整页重算 */
export type ScanScopeCoreSlice = Pick<
  ScanScopeState,
  | 'plant'
  | 'selectedMachines'
  | 'date'
  | 'shift'
  | 'slots'
  | 'types'
  | 'levels'
  | 'imageKind'
>

export interface ScanScopeDerived {
  configured: boolean
  hasMachines: boolean
  ready: boolean
  missing: string[]
  filterSignature: string
  params: Omit<ScanTaskParams, 'category'>
  summarySegments: string[]
  summaryTooltip: string
}

export interface ScanScopeMachineView {
  configured: boolean
  activeMachines: PickableMachine[]
  plants: Array<{ value: Plant; label: string; count: number }>
  visibleMachines: PickableMachine[]
  allVisibleSelected: boolean
  sideCounts: Record<AoiSide, number>
}

export interface CreateScanScopeOptions {
  /** 测试注入内存存储；浏览器默认走 window.localStorage */
  storage?: StateStorage
  /** 测试注入时钟；默认取当前系统时间 */
  now?: () => Date
}

const createMemoryStorage = (): StateStorage => {
  const map = new Map<string, string>()

  return {
    getItem: (name) => map.get(name) ?? null,
    setItem: (name, value) => {
      map.set(name, value)
    },
    removeItem: (name) => {
      map.delete(name)
    },
  }
}

const resolveDefaultStorage = (): StateStorage => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage
    }
  } catch {
    // 无浏览器存储时回退内存实例
  }

  return createMemoryStorage()
}

const plantOfCompositeKey = (key: string): string => {
  const idx = key.indexOf('/')
  return idx === -1 ? '' : key.slice(0, idx)
}

const plantResolverOf = (category: ScanCategory): ((key: string) => string) =>
  category === 'el' ? (key) => elPlantOf(key) ?? '' : plantOfCompositeKey

const shapeSlots = (list: string[], padded: boolean): string[] =>
  padded ? list.map((item) => item.padStart(2, '0')) : list

const formatDateLabel = (date: string): string =>
  date.length === 8
    ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`
    : date

const sidePredicate = (
  side: AoiSide,
): ((machine: PickableMachine) => boolean) | undefined =>
  side === 'all' ? undefined : (machine) => aoiSideOfName(machine.name) === side

const activeMachinesOf = (
  category: ScanCategory,
  settings: AppSettings | null,
): PickableMachine[] =>
  pickableMachinesFromSettings(category, settings)
    .filter((item) => !item.stale)
    .sort((a, b) => compareMachineName(a.name, b.name))

const derivePlants = (active: PickableMachine[]): Plant[] => {
  const names = [...new Set(active.map((item) => item.plant))]
  return names.sort((a, b) => compareNatural(plantLabel(a), plantLabel(b)))
}

const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((item, idx) => item === b[idx])

export const deriveScopeView = (
  category: ScanCategory,
  slice: ScanScopeCoreSlice,
  settings: AppSettings | null,
): ScanScopeDerived => {
  const meta = SCAN_CATEGORY_META[category]
  const categoryConfig = settings?.categories[category]
  const configured = Boolean(categoryConfig?.entryRoot)
  const hasMachines = activeMachinesOf(category, settings).length > 0
  const typeCatalog = categoryConfig?.typeCatalog ?? []

  const ready =
    configured &&
    slice.selectedMachines.length > 0 &&
    (!meta.hasSlots || slice.slots.length > 0) &&
    (!meta.requiresLevels || slice.levels.length > 0) &&
    slice.types.length > 0 &&
    Boolean(slice.date)

  const missing = configured
    ? [
        slice.selectedMachines.length ? '' : '机台',
        slice.date ? '' : '日期',
        meta.hasSlots && !slice.slots.length ? '时段' : '',
        meta.requiresLevels && !slice.levels.length ? '等级' : '',
        slice.types.length
          ? ''
          : typeCatalog.length
            ? '类型'
            : '类型（点「编辑」添加）',
      ].filter(Boolean)
    : []

  const imageKind = meta.hasImageKind ? slice.imageKind : undefined
  const filterSignature = [
    slice.plant,
    slice.date,
    slice.shift,
    meta.hasSlots ? slice.slots.join(',') : '',
    meta.requiresLevels ? slice.levels.join(',') : '',
    imageKind ?? '',
    slice.types.join(','),
    slice.selectedMachines.join(','),
  ].join('|')

  const params: Omit<ScanTaskParams, 'category'> = {
    machines: slice.selectedMachines,
    date: slice.date,
    shift: slice.shift,
    slots: meta.hasSlots ? slice.slots : [],
    types: slice.types,
    ...(meta.requiresLevels ? { levels: slice.levels } : {}),
    ...(imageKind ? { aoiImageKind: imageKind } : {}),
  }

  const summarySegments: string[] = []
  const plantText = slice.plant ? plantLabel(slice.plant) : ''
  summarySegments.push(
    plantText
      ? `${plantText} ${slice.selectedMachines.length} 台`
      : `${slice.selectedMachines.length} 台机台`,
  )

  if (slice.date) {
    summarySegments.push(`${formatDateLabel(slice.date)} ${slice.shift}`)
  }

  if (meta.hasSlots && slice.slots.length > 0) {
    summarySegments.push(`${slice.slots.length} 时段`)
  }

  if (meta.requiresLevels && slice.levels.length > 0) {
    summarySegments.push(`等级 ${slice.levels.join('/')}`)
  }

  if (meta.hasImageKind) {
    summarySegments.push(AOI_IMAGE_KIND_LABEL[slice.imageKind])
  }

  if (slice.types.length > 0) {
    summarySegments.push(
      slice.types.length <= 2
        ? slice.types.join('、')
        : `${slice.types.slice(0, 2).join('、')} 等 ${slice.types.length} 类`,
    )
  }

  const summaryTooltip = [
    slice.selectedMachines.length > 0
      ? `机台：${slice.selectedMachines.join('、')}`
      : null,
    slice.types.length > 0 ? `类型：${slice.types.join('、')}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  return {
    configured,
    hasMachines,
    ready,
    missing,
    filterSignature,
    params,
    summarySegments,
    summaryTooltip,
  }
}

export interface ScanScope {
  readonly category: ScanCategory
  /** 读取当前完整状态快照 */
  getState: () => ScanScopeState
  /** 按当前状态与配置计算完整派生视图 */
  project: (settings: AppSettings | null) => ScanScopeDerived
  /** 计算机台列表派生视图 */
  projectMachines: (settings: AppSettings | null) => ScanScopeMachineView
  /** 当前班次可选的全部时段 */
  availableSlots: (shift?: '白班' | '夜班') => string[]
  /** 首次默认播种 + 按最新配置裁剪过期机台/类型并补齐首厂区默认机台 */
  reconcile: (settings: AppSettings | null) => void
  /** 用户主动切换班次：重算对应时段（当前班次取到当前整点，另一班次清空） */
  changeShift: (shift: '白班' | '夜班') => void
  /** 用户主动切换厂区：切换到目标厂区并默认勾选非 LX 机台 */
  changePlant: (plant: Plant, settings: AppSettings | null) => void
  /** 用户主动切换 AOI 检测面：按新检测面默认勾选本厂区非 LX 机台 */
  changeSide: (side: AoiSide, settings: AppSettings | null) => void
  /** 历史记录原子回填并按当前配置归一化；不触发班次时段重播 */
  restore: (item: ScanHistoryItem, settings: AppSettings | null) => void
  setDate: (date: string) => void
  setSlots: (slots: string[]) => void
  toggleAllSlots: () => void
  setLevels: (levels: string[]) => void
  toggleAllLevels: () => void
  setTypes: (types: string[]) => void
  toggleAllTypes: (catalog: readonly string[]) => void
  addSelectedType: (type: string) => void
  removeSelectedType: (type: string) => void
  setImageKind: (imageKind: AoiImageKind) => void
  setKeyword: (keyword: string) => void
  setSelectedMachines: (machines: string[]) => void
  toggleVisibleMachines: (settings: AppSettings | null) => void
  /** 仅供同模块 React 订阅 hook 使用 */
  useSlice: <T>(selector: (state: ScanScopeState) => T) => T
}

export const createScanScope = (
  category: ScanCategory,
  options: CreateScanScopeOptions = {},
): ScanScope => {
  const meta = SCAN_CATEGORY_META[category]
  const plantOf = plantResolverOf(category)
  const now = options.now ?? (() => new Date())
  const storage = options.storage ?? resolveDefaultStorage()

  let dateSeeded = false
  let levelsSeeded = false

  const store = create<ScanScopeState>()(
    devtools(
      persist<ScanScopeState, [], [], Pick<ScanScopeState, 'types'>>(
        () => ({
          plant: '',
          keyword: '',
          selectedMachines: [],
          date: '',
          shift: '白班',
          slots: [],
          types: [],
          levels: [],
          imageKind: DEFAULT_AOI_IMAGE_KIND,
          side: 'all',
        }),
        {
          name: `filter-types:${category}`,
          storage: createJSONStorage(() => storage),
          partialize: (state) => ({ types: state.types }),
        },
      ),
      { name: `filter:${category}` },
    ),
  )

  const availableSlots = (
    shift: '白班' | '夜班' = store.getState().shift,
  ): string[] => {
    if (!meta.hasSlots) return []

    return meta.paddedSlots
      ? getAllPaddedTimes(shift)
      : getAllAvailableTimes(shift)
  }

  const computeMachineView = (
    state: ScanScopeState,
    settings: AppSettings | null,
  ): ScanScopeMachineView => {
    const configured = Boolean(settings?.categories[category].entryRoot)
    const activeMachines = activeMachinesOf(category, settings)
    const plantNames = derivePlants(activeMachines)
    const plants = plantNames.map((name) => ({
      value: name,
      label: plantLabel(name),
      count: activeMachines.filter((item) => item.plant === name).length,
    }))

    const inPlant = activeMachines.filter((item) => item.plant === state.plant)
    const sideCounts: Record<AoiSide, number> = {
      all: inPlant.length,
      front: inPlant.filter((m) => aoiSideOfName(m.name) === 'front').length,
      back: inPlant.filter((m) => aoiSideOfName(m.name) === 'back').length,
    }

    const predicate = meta.hasSideFilter ? sidePredicate(state.side) : undefined
    const sideFiltered = predicate ? inPlant.filter(predicate) : inPlant
    const key = state.keyword.trim().toUpperCase()
    const visibleMachines = key
      ? sideFiltered.filter((item) => item.name.toUpperCase().includes(key))
      : sideFiltered

    const allVisibleSelected =
      visibleMachines.length > 0 &&
      visibleMachines.every((item) => state.selectedMachines.includes(item.key))

    return {
      configured,
      activeMachines,
      plants,
      visibleMachines,
      allVisibleSelected,
      sideCounts,
    }
  }

  const reconcile = (settings: AppSettings | null): void => {
    const cur = store.getState()
    const patch: Partial<ScanScopeState> = {}

    if (!dateSeeded) {
      dateSeeded = true
      if (!cur.date) {
        const info = getShiftInfo(now())
        patch.date = info.date
        patch.shift = info.shift
        patch.slots = meta.hasSlots
          ? shapeSlots(info.times, meta.paddedSlots)
          : []
      }
    }

    if (meta.requiresLevels && !levelsSeeded) {
      levelsSeeded = true
      if (cur.levels.length === 0) {
        patch.levels = [...PL_LEVELS]
      }
    }

    if (settings !== null) {
      const catalog = settings.categories[category].typeCatalog
      const aliveTypes = cur.types.filter((type) => catalog.includes(type))
      if (!sameList(aliveTypes, cur.types)) {
        patch.types = aliveTypes
      }

      const active = activeMachinesOf(category, settings)
      const allowedKeys = new Set(active.map((item) => item.key))
      let nextSelected = cur.selectedMachines.filter((key) =>
        allowedKeys.has(key),
      )

      const plants = derivePlants(active)
      if (plants.length > 0 && !plants.includes(cur.plant)) {
        const firstPlant = plants[0]
        patch.plant = firstPlant
        nextSelected = defaultSelectedKeys(
          active,
          firstPlant,
          meta.hasSideFilter ? sidePredicate(cur.side) : undefined,
        )
      }

      if (!sameList(nextSelected, cur.selectedMachines)) {
        patch.selectedMachines = nextSelected
      }
    }

    if (Object.keys(patch).length > 0) {
      store.setState(patch)
    }
  }

  const filterToSinglePlant = (machines: string[], plant: string): string[] =>
    plant ? machines.filter((key) => plantOf(key) === plant) : machines

  return {
    category,
    getState: () => store.getState(),
    project: (settings) =>
      deriveScopeView(category, store.getState(), settings),
    projectMachines: (settings) =>
      computeMachineView(store.getState(), settings),
    availableSlots,
    reconcile,

    changeShift: (nextShift) => {
      const cur = store.getState()
      if (cur.shift === nextShift) return

      const { shift: currentShift, times } = getShiftInfo(now())
      const nextSlots =
        meta.hasSlots && nextShift === currentShift
          ? shapeSlots(times, meta.paddedSlots)
          : []

      store.setState({ shift: nextShift, slots: nextSlots })
    },

    changePlant: (nextPlant, settings) => {
      const cur = store.getState()
      if (cur.plant === nextPlant) return

      const active = activeMachinesOf(category, settings)
      const nextSelected = defaultSelectedKeys(
        active,
        nextPlant,
        meta.hasSideFilter ? sidePredicate(cur.side) : undefined,
      )

      store.setState({ plant: nextPlant, selectedMachines: nextSelected })
    },

    changeSide: (nextSide, settings) => {
      const cur = store.getState()
      if (!meta.hasSideFilter || cur.side === nextSide) return

      const active = activeMachinesOf(category, settings)
      const nextSelected =
        active.length > 0 && cur.plant
          ? defaultSelectedKeys(active, cur.plant, sidePredicate(nextSide))
          : nextSide === 'all'
            ? cur.selectedMachines
            : cur.selectedMachines.filter(
                (key) => aoiSideOfKey(key) === nextSide,
              )

      store.setState({ side: nextSide, selectedMachines: nextSelected })
    },

    restore: (item, settings) => {
      dateSeeded = true
      levelsSeeded = true

      const cur = store.getState()
      const {
        machines: picked,
        date,
        shift,
        slots,
        types,
        levels,
      } = item.params
      const restoredPlant =
        category === 'el'
          ? picked.length
            ? (elPlantOf(picked[0]) ?? '')
            : ''
          : (picked[0]?.split('/')[0] ?? '')
      const nextPlant = restoredPlant || cur.plant
      const nextImageKind =
        category === 'aoi'
          ? (item.params.aoiImageKind ?? DEFAULT_AOI_IMAGE_KIND)
          : cur.imageKind
      const nextSide = category === 'aoi' ? aoiSideOfMachines(picked) : cur.side

      let nextSelected = filterToSinglePlant(picked, nextPlant)
      if (category === 'aoi' && nextSide !== 'all') {
        nextSelected = nextSelected.filter(
          (key) => aoiSideOfKey(key) === nextSide,
        )
      }

      let nextTypes = [...types]
      if (settings !== null) {
        const catalog = settings.categories[category].typeCatalog
        nextTypes = nextTypes.filter((type) => catalog.includes(type))

        const allowed = new Set(
          activeMachinesOf(category, settings).map((machine) => machine.key),
        )
        nextSelected = nextSelected.filter((key) => allowed.has(key))
      }

      store.setState({
        plant: nextPlant,
        imageKind: nextImageKind,
        side: nextSide,
        selectedMachines: nextSelected,
        date,
        shift,
        slots: meta.hasSlots ? [...slots] : [],
        types: nextTypes,
        levels:
          meta.requiresLevels && levels?.length ? [...levels] : cur.levels,
      })
    },

    setDate: (date) => store.setState({ date }),
    setSlots: (slots) => store.setState({ slots }),
    toggleAllSlots: () => {
      const cur = store.getState()
      const all = availableSlots(cur.shift)
      store.setState({ slots: cur.slots.length === all.length ? [] : all })
    },
    setLevels: (levels) => store.setState({ levels }),
    toggleAllLevels: () => {
      const cur = store.getState()
      store.setState({
        levels: cur.levels.length === PL_LEVELS.length ? [] : [...PL_LEVELS],
      })
    },
    setTypes: (types) => store.setState({ types }),
    toggleAllTypes: (catalog) => {
      const cur = store.getState()
      store.setState({
        types: cur.types.length === catalog.length ? [] : [...catalog],
      })
    },
    addSelectedType: (type) => {
      const cur = store.getState()
      if (!cur.types.includes(type)) {
        store.setState({ types: [...cur.types, type] })
      }
    },
    removeSelectedType: (type) => {
      const cur = store.getState()
      if (cur.types.includes(type)) {
        store.setState({ types: cur.types.filter((item) => item !== type) })
      }
    },
    setImageKind: (imageKind) => store.setState({ imageKind }),
    setKeyword: (keyword) => store.setState({ keyword }),
    setSelectedMachines: (machines) => {
      const cur = store.getState()
      store.setState({
        selectedMachines: filterToSinglePlant(machines, cur.plant),
      })
    },
    toggleVisibleMachines: (settings) => {
      const cur = store.getState()
      const { visibleMachines, allVisibleSelected } = computeMachineView(
        cur,
        settings,
      )
      const visibleKeys = visibleMachines.map((item) => item.key)
      const next = allVisibleSelected
        ? cur.selectedMachines.filter((key) => !visibleKeys.includes(key))
        : [...new Set([...cur.selectedMachines, ...visibleKeys])]

      store.setState({
        selectedMachines: filterToSinglePlant(next, cur.plant),
      })
    },

    useSlice: (selector) => store(useShallow(selector)),
  }
}

const scopes: Partial<Record<ScanCategory, ScanScope>> = {}

export const scanScopeOf = (category: ScanCategory): ScanScope =>
  (scopes[category] ??= createScanScope(category))

/** 工作区与摘要条共用的窄订阅视图：搜索词与检测面过滤变化不会重渲染任务面板 */
export const useScanScopeView = (
  category: ScanCategory,
  settings: AppSettings | null,
): ScanScopeDerived => {
  const scope = scanScopeOf(category)
  const slice = scope.useSlice((state) => ({
    plant: state.plant,
    selectedMachines: state.selectedMachines,
    date: state.date,
    shift: state.shift,
    slots: state.slots,
    types: state.types,
    levels: state.levels,
    imageKind: state.imageKind,
  }))

  return deriveScopeView(category, slice, settings)
}
