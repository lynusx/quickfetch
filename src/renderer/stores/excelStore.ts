import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

import type { ExcelFile, ExcelSheet } from '../types'

interface ExcelState {
  file: ExcelFile | null
  sheet: ExcelSheet | null
}

interface ExcelAction {
  setFile: (file: ExcelFile | null) => void
  setSheet: (sheet: ExcelSheet | null) => void
}

export const useExcelStore = create<ExcelState & ExcelAction>()(
  devtools((set) => ({
    file: null,
    sheet: null,
    setFile: (file) => set({ file: file }),
    setSheet: (sheet) => set({ sheet }),
  })),
)
