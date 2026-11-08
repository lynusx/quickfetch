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
  reset: () => void
}

/** 内容相同就不写回，避免解析结果每次重新生成时触发无限重渲染 */
const sameSet = (a: Set<string>, b: Set<string>): boolean =>
  a.size === b.size && [...a].every((item) => b.has(item))

const sameList = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((item, index) => item === b[index])

export const useSheetFilterStore = create<
  SheetFilterState & SheetFilterActions
>()(
  devtools((set) => ({
    lines: new Set<string>(),
    defects: new Set<string>(),
    selectedLines: [],
    selectedDefects: [],
    setLines: (lines) =>
      set((state) => (sameSet(state.lines, lines) ? state : { lines })),
    setDefects: (defects) =>
      set((state) => (sameSet(state.defects, defects) ? state : { defects })),
    setSelectedLines: (lines) =>
      set((state) =>
        sameList(state.selectedLines, lines) ? state : { selectedLines: lines },
      ),
    setSelectedDefects: (defects) =>
      set((state) =>
        sameList(state.selectedDefects, defects)
          ? state
          : { selectedDefects: defects },
      ),
    reset: () =>
      set({
        lines: new Set<string>(),
        defects: new Set<string>(),
        selectedLines: [],
        selectedDefects: [],
      }),
  })),
)
