import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

interface SheetFilterState {
  lines: Set<string>
  defects: Set<string>
  selectedLines: string[]
  selectedDefects: string[]
}

interface SheetFilterActions {
  setLines: (lines: Set<string>) => void
  setDefects: (defects: Set<string>) => void
  setSelectedLines: (lines: string[]) => void
  setSelectedDefects: (defects: string[]) => void
}

export const useSheetFilterStore = create<
  SheetFilterState & SheetFilterActions
>()(
  devtools((set) => ({
    lines: new Set<string>(),
    defects: new Set<string>(),
    selectedLines: [],
    selectedDefects: [],
    setLines: (lines) => set({ lines }),
    setDefects: (defects) => set({ defects }),
    setSelectedLines: (lines) => set({ selectedLines: lines }),
    setSelectedDefects: (defects) => set({ selectedDefects: defects }),
  })),
)
