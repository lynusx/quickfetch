import { create } from 'zustand'
import { getShiftInfo } from '../utils/common'

const shiftInfo = getShiftInfo(new Date())

const useStore = create((set) => ({
  // File scanning state
  files: [],
  isScanning: false,
  scanError: null,

  // 厂区
  plant: 'A',

  // 污染类型
  types: ['脏污', '划伤'],

  // Copy state
  copiedCount: 0,
  isCopying: false,
  copyError: null,

  // Query parameters
  queryParams: {
    dirs: [],
    date: shiftInfo[0],
    shift: shiftInfo[1],
    times: shiftInfo[2],
    // types: ['NG_脏污_B', 'NG_脏污_C', 'NG_划伤_C', 'NG_划伤_C'],
  },

  // Actions
  setFiles: (files: any[]) => set({ files }),
  setPlant: (plant: string) => set({ plant }),
  setTypes: (types: string[]) => set({ types }),
  setScanningState: (isScanning: boolean) => set({ isScanning }),
  setScanError: (error: string | null) => set({ scanError: error }),
  setCopiedCount: (count: number) => set({ copiedCount: count }),
  setCopyingState: (isCopying: boolean) => set({ isCopying }),
  setCopyError: (error: string | null) => set({ copyError: error }),
  updateQueryParams: (
    params: Partial<{
      dirs: string[]
      date: string
      shift: string
      times: string[]
    }>,
  ) =>
    set((state: any) => ({
      queryParams: { ...state.queryParams, ...params },
    })),
}))

export default useStore
