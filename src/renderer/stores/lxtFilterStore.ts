import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

import type { Plant } from '../../shared/ipc'

/**
 * 力禧特页的筛选条件。
 *
 * 跟 EL 页完全独立：两类的机台、类型命名规则都不一样，共用一个 store
 * 会出现「在 EL 勾了 8 号机，切到力禧特勾的是同一批下标」这种串。
 *
 * 机台用「厂区/机台」复合键 —— 东区和西区都有 LX2，只用机台名会扫错机器。
 */
interface LxtFilterState {
  /** 当前查看的厂区，只影响列表展示，不参与路径拼接 */
  plant: Plant
  /** 当前厂区机台列表的搜索词，输入 7 就命中 7A/7B */
  keyword: string
  selectedMachines: string[]
  date: string
  shift: '白班' | '夜班'
  slots: string[]
  types: string[]
}

interface LxtFilterAction {
  setPlant: (plant: Plant) => void
  setKeyword: (keyword: string) => void
  setSelectedMachines: (machines: string[]) => void
  /** 机台列表变化后，把已被删掉或标成 stale 的机台从选中里剔掉 */
  pruneSelected: (available: string[]) => void
  setDate: (date: string) => void
  setShift: (shift: '白班' | '夜班') => void
  setSlots: (slots: string[]) => void
  setTypes: (types: string[]) => void
  addType: (type: string) => void
  removeType: (type: string) => void
}

export const useLxtFilterStore = create<LxtFilterState & LxtFilterAction>()(
  devtools((set) => ({
    plant: '',
    keyword: '',
    selectedMachines: [],
    date: '',
    shift: '白班',
    slots: [],
    types: [],

    setPlant: (plant) => set({ plant }),
    setKeyword: (keyword) => set({ keyword }),
    setSelectedMachines: (selectedMachines) => set({ selectedMachines }),

    pruneSelected: (available) =>
      set((state) => {
        const allowed = new Set(available)
        const next = state.selectedMachines.filter((key) => allowed.has(key))

        return next.length === state.selectedMachines.length
          ? state
          : { selectedMachines: next }
      }),

    setDate: (date) => set({ date }),
    setShift: (shift) => set({ shift }),
    setSlots: (slots) => set({ slots }),
    setTypes: (types) => set({ types }),

    addType: (type) =>
      set((state) =>
        state.types.includes(type) ? state : { types: [...state.types, type] },
      ),

    removeType: (type) =>
      set((state) => ({
        types: state.types.filter((item) => item !== type),
      })),
  })),
)
