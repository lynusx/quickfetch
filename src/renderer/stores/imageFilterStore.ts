import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

import type { Plant } from '../../shared/ipc'
import { useUserPreferencesStore } from './userPreferencesStore'

const defaultTypes = useUserPreferencesStore.getState().ngTypes

interface ImageFilterState {
  /** 当前查看的厂区，只影响机台列表的展示，不参与路径拼接 */
  plant: Plant
  /** 选中的机台目录名，可跨厂区多选 */
  selectedMachines: string[]
  date: string
  shift: '白班' | '夜班'
  slots: string[]
  types: string[]
}

interface ImageFilterAction {
  setPlant: (plant: Plant) => void
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
  devtools((set) => ({
    plant: 'east',
    selectedMachines: [],
    types: defaultTypes,
    date: '',
    shift: '白班',
    slots: [],

    setPlant: (plant) => set({ plant }),

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
  })),
)
