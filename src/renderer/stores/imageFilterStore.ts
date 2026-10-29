import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

import { useUserPreferencesStore } from './userPreferencesStore'

const ngTypes = useUserPreferencesStore.getState().ngTypes

interface ImageFilterState {
  plant: 'A' | 'B'
  dirs: string[]
  types: string[]
  date: string
  shift: '白班' | '夜班'
  times: string[]
}

interface ImageFilterAction {
  setPlant: (plant: 'A' | 'B') => void
  setDirs: (dirs: string[]) => void
  setTypes: (types: string[]) => void
  removeType: (type: string) => void
  setDate: (date: string) => void
  setShift: (shift: '白班' | '夜班') => void
  setTimes: (times: string[]) => void
}

export const useImageFilterStore = create<
  ImageFilterState & ImageFilterAction
>()(
  devtools((set) => ({
    plant: 'A',
    dirs: [],
    types: ngTypes,
    date: '',
    shift: '' as '白班' | '夜班',
    times: [],

    setPlant: (plant) => set({ plant }),
    setDirs: (dirs) => set({ dirs }),
    setTypes: (types) => set({ types }),
    removeType: (type) =>
      set((state) => ({
        types: state.types.filter((t) => t !== type),
      })),
    setDate: (date) => set({ date }),
    setShift: (shift) => set({ shift }),
    setTimes: (times) => set({ times }),
  })),
)
