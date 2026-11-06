import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'

import type { AoiImageKind, AoiSide, Plant, ScanCategory } from '@shared/ipc'
import { aoiSideOfKey, DEFAULT_AOI_IMAGE_KIND } from '@shared/ipc'

/**
 * 「厂区 / 机台」类扫描页的筛选条件。
 *
 * 力禧特与利珀的取数规则几乎一样：入口是一堆 .lnk、机台按厂区分组、
 * 日期+班次+时段+类型四层规则也一致。所以筛选状态用同一套工厂生成，
 * 各自一份实例 —— 两类仍然完全独立，切页面不会把上一类的勾选带过来。
 *
 * 机台用「厂区/机台」复合键：两个区都有 LX2 / 6B，只用机台名会扫错机器。
 */
export interface PlantFilterSlice {
  /** 当前查看的厂区，只影响列表展示，不参与路径拼接 */
  plant: Plant
  /** 当前厂区机台列表的搜索词，输入 7 就命中 7A/7B */
  keyword: string
  /**
   * 选中的机台复合键（「厂区/机台」）。
   *
   * 东西区互斥：一次只允许勾一个厂区的机台。切厂区时选中会被清空，
   * 避免「东区勾几台、切到西区再勾几台」混在一个任务里。
   */
  selectedMachines: string[]
  date: string
  shift: '白班' | '夜班'
  slots: string[]
  types: string[]
  /** 缺陷等级，只有利珀用得到（路径里的 A/B/C 层） */
  levels: string[]
  /** 图片类型，只有森标 AOI 用得到：决定第二层读 SaveImages 还是 SaveSmallImages */
  imageKind: AoiImageKind
  /**
   * 检测面，只有森标 AOI 用得到：按机台名里的「正检/背检」过滤列表。
   * 只影响哪些机台可选，不参与路径；切换时连带裁掉另一侧的已选机台。
   */
  side: AoiSide
}

export interface PlantFilterActions {
  setPlant: (plant: Plant) => void
  setKeyword: (keyword: string) => void
  setSelectedMachines: (machines: string[]) => void
  /** 机台列表变化后，把已被删掉或标成 stale 的机台从选中里剔掉 */
  pruneSelected: (available: string[]) => void
  setDate: (date: string) => void
  setShift: (shift: '白班' | '夜班') => void
  setSlots: (slots: string[]) => void
  setTypes: (types: string[]) => void
  setLevels: (levels: string[]) => void
  setImageKind: (kind: AoiImageKind) => void
  setSide: (side: AoiSide) => void
}

/** 从复合键「厂区/机台」里取厂区，用于互斥判定；无斜杠时视为无厂区 */
const plantOfKey = (key: string): string => {
  const idx = key.indexOf('/')
  return idx === -1 ? '' : key.slice(0, idx)
}

/**
 * 切检测面时保留哪些已选机台。
 *
 * 不裁剪的话，看不见的另一侧机台还留在选中里，点「开始扫描」会把它们
 * 一并扫进去 —— 这与「切厂区清空选中」是同一个道理。
 */
export const pruneMachinesToSide = (
  machines: string[],
  side: AoiSide,
): string[] =>
  side === 'all'
    ? machines
    : machines.filter((key) => aoiSideOfKey(key) === side)

export interface PlantFilterOptions {
  /**
   * 选中值 → 厂区。默认按「厂区/机台」复合键取第一段；
   * EL 的选中值是纯机台名，由 elPlantOf 决定。
   */
  plantOf?: (value: string) => string
}

/**
 * 造一个筛选 store。
 *
 * category 只用于 devtools 里区分两份实例，不影响行为。
 */
export const createPlantFilterStore = (
  category: ScanCategory,
  options: PlantFilterOptions = {},
) => {
  const plantOf = options.plantOf ?? plantOfKey

  return create<PlantFilterSlice & PlantFilterActions>()(
    devtools(
      persist<
        PlantFilterSlice & PlantFilterActions,
        [],
        [],
        Pick<PlantFilterSlice, 'types'>
      >(
        (set) => ({
          plant: '',
          keyword: '',
          selectedMachines: [],
          date: '',
          shift: '白班',
          slots: [],
          // 类型不预设：现场命名差异大，猜错的成本比手输一次高
          types: [],
          levels: [],
          imageKind: DEFAULT_AOI_IMAGE_KIND,
          side: 'all',

          // 切厂区 = 互斥切换：清掉上一区的选中，从零开始。
          // 点当前厂区不算切换，否则会莫名把已勾选的机台全部清掉。
          setPlant: (plant) =>
            set((state) =>
              state.plant === plant ? state : { plant, selectedMachines: [] },
            ),
          setKeyword: (keyword) => set({ keyword }),
          // 只允许一个厂区的机台同时被选中；跨区传进来的键一律按当前 plant 过滤
          setSelectedMachines: (selectedMachines) =>
            set((state) => {
              const next = state.plant
                ? selectedMachines.filter((key) => plantOf(key) === state.plant)
                : selectedMachines

              return { selectedMachines: next }
            }),

          pruneSelected: (available) =>
            set((state) => {
              const allowed = new Set(available)
              const next = state.selectedMachines.filter((key) =>
                allowed.has(key),
              )

              return next.length === state.selectedMachines.length
                ? state
                : { selectedMachines: next }
            }),

          setDate: (date) => set({ date }),
          setShift: (shift) => set({ shift }),
          setSlots: (slots) => set({ slots }),
          setTypes: (types) => set({ types }),
          setLevels: (levels) => set({ levels }),
          setImageKind: (imageKind) => set({ imageKind }),

          // 切检测面等于换了一批机台：把另一侧的已选机台一并裁掉，
          // 否则它们还留在选中里，点「开始扫描」会把看不见的机台也扫进去。
          setSide: (side) =>
            set((state) => ({
              side,
              selectedMachines: pruneMachinesToSide(
                state.selectedMachines,
                side,
              ),
            })),
        }),
        {
          // 只记勾选过的类型，日期/班次/时段/等级/图片类型每次进页面都重新带出：
          // 图片类型决定读哪个目录，持久化会让明天打开时静默换成另一份图
          name: `filter-types:${category}`,
          partialize: (state) => ({ types: state.types }),
        },
      ),
      { name: `filter:${category}` },
    ),
  )
}

export type PlantFilterStore = ReturnType<typeof createPlantFilterStore>
