import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

interface ScanRange {
  directories: string[]
  date: string
  shift: '白班' | '夜班'
  times: string[]
}

interface ImageCopyState {
  // 文件扫描状态
  scannedFiles: { path: string; fileHandle: FileSystemFileHandle }[]
  isScanning: boolean
  scanError: string | null

  // 配置参数
  plant: string
  types: string[]
  isManual: boolean

  // 扫描范围
  currentScanRange: ScanRange

  // 文件复制状态
  copiedFileCount: number
  isCopying: boolean
  copyError: string | null
}

interface ImageCopyAction {
  // 文件扫描状态
  setScannedFiles: (
    files: { path: string; fileHandle: FileSystemFileHandle }[],
  ) => void
  setScanningState: (isScanning: boolean) => void
  setScanError: (error: string | null) => void

  // 配置参数
  setPlant: (plant: string) => void
  setTypes: (types: string[]) => void
  setIsManual: (isManual: boolean) => void

  // 扫描范围
  setCurrentScanRange: (range: Partial<ScanRange>) => void

  // 文件复制状态
  setCopiedFileCount: (count: number) => void
  setCopyingState: (copying: boolean) => void
  setCopyError: (error: string | null) => void
}

const useImageCopyStore = create<ImageCopyState & ImageCopyAction>()(
  devtools((set) => ({
    // 初始状态
    scannedFiles: [],
    isScanning: false,
    scanError: null,

    plant: 'A',
    types: ['脏污', '划伤'],
    isManual: false,

    currentScanRange: {
      directories: [],
      date: '',
      shift: '' as '白班' | '夜班',
      times: [],
    },

    copiedFileCount: 0,
    isCopying: false,
    copyError: null,

    // 操作方法
    setScannedFiles: (files) => set({ scannedFiles: files }),
    setScanningState: (isScanning) => set({ isScanning }),
    setScanError: (error) => set({ scanError: error }),

    setPlant: (plant) => set({ plant: plant }),
    setTypes: (types) => set({ types: types }),
    setIsManual: (isManual) => set({ isManual }),

    setCurrentScanRange: (range) =>
      set((state) => ({
        currentScanRange: { ...state.currentScanRange, ...range },
      })),

    setCopiedFileCount: (count) => set({ copiedFileCount: count }),
    setCopyingState: (isCopying) => set({ isCopying }),
    setCopyError: (error) => set({ copyError: error }),
  })),
)

export default useImageCopyStore
