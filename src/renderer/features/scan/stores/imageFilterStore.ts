import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'

import type { Plant } from '@shared/ipc'

interface ImageFilterState {
  /** 当前查看的厂区，只影响机台列表的展示，不参与路径拼接 */
  plant: Plant
  /** 机台名过滤词，只做前端筛显，不参与路径拼接 */
  keyword: string
  /** 选中的机台目录名，可跨厂区多选 */
  selectedMachines: string[]
  date: string
  shift: '白班' | '夜班'
  slots: string[]
  types: string[]
}

interface ImageFilterAction {
  setPlant: (plant: Plant) => void
  setKeyword: (keyword: string) => void
  setSelectedMachines: (machines: string[]) => void
  toggleMachine: (machine: string) => void
  setDate: (date: string) => void
  setShift: (shift: '白班' | '夜班') => void
  setSlots: (slots: string[]) => void
  setTypes: (types: string[]) => void
  removeType: (type: string) => void
}

export const useImageFilterStore = create<
  ImageFilterState & ImageFilterAction
>()(
  devtools(
    persist<
      ImageFilterState & ImageFilterAction,
      [],
      [],
      Pick<ImageFilterState, 'types'>
    >(
      (set) => ({
        plant: 'east',
        keyword: '',
        selectedMachines: [],
        // 类型不预设：现场命名差异大，猜错的成本比手输一次高
        types: [],
        date: '',
        shift: '白班',
        slots: [],

        setPlant: (plant) => set({ plant }),

        setKeyword: (keyword) => set({ keyword }),

        setSelectedMachines: (selectedMachines) => set({ selectedMachines }),

        toggleMachine: (machine) =>
          set((state) => ({
            selectedMachines: state.selectedMachines.includes(machine)
              ? state.selectedMachines.filter((item) => item !== machine)
              : [...state.selectedMachines, machine],
          })),

        setDate: (date) => set({ date }),
        setShift: (shift) => set({ shift }),
        setSlots: (slots) => set({ slots }),
        setTypes: (types) => set({ types }),

        removeType: (type) =>
          set((state) => ({
            types: state.types.filter((item) => item !== type),
          })),
      }),
      {
        // 只记勾选过的类型，日期/班次/时段每次进页面都按当前时间重新带出
        name: 'filter-types:el',
        partialize: (state) => ({ types: state.types }),
      },
    ),
  ),
)
