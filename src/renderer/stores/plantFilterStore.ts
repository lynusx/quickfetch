import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'

import type { Plant, ScanCategory } from '../../shared/ipc'

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
}

/** 从复合键「厂区/机台」里取厂区，用于互斥判定；无斜杠时视为无厂区 */
const plantOf = (key: string): string => {
  const idx = key.indexOf('/')
  return idx === -1 ? '' : key.slice(0, idx)
}

/**
 * 造一个筛选 store。
 *
 * category 只用于 devtools 里区分两份实例，不影响行为。
 */
export const createPlantFilterStore = (category: ScanCategory) =>
  create<PlantFilterSlice & PlantFilterActions>()(
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

          // 切厂区 = 互斥切换：清掉上一区的选中，从零开始
          setPlant: (plant) => set({ plant, selectedMachines: [] }),
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
        }),
        {
          // 只记勾选过的类型，日期/班次/时段/等级每次进页面都重新带出
          name: `filter-types:${category}`,
          partialize: (state) => ({ types: state.types }),
        },
      ),
      { name: `filter:${category}` },
    ),
  )

export type PlantFilterStore = ReturnType<typeof createPlantFilterStore>
