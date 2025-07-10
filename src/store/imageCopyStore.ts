import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

interface ScanRange {
  directories: string[]
  date: string
  shift: string
  times: string[]
}

interface ImageCopyState {
  // 文件扫描状态
  scannedFiles: any[]
  isScanning: boolean
  scanError: string | null

  // 配置参数
  selectedPlant: string
  selectedTypes: string[]

  // 扫描范围
  currentScanRange: ScanRange

  // 文件复制状态
  copiedFileCount: number
  isCopying: boolean
  copyError: string | null
}

interface ImageCopyAction {
  // 文件扫描状态
  setScannedFiles: (files: any[]) => void
  setScanningState: (isScanning: boolean) => void
  setScanError: (error: string | null) => void

  // 配置参数
  setSelectedPlant: (plant: string) => void
  setSelectedTypes: (types: string[]) => void

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

    selectedPlant: 'A',
    selectedTypes: ['脏污', '划伤'],

    currentScanRange: {
      directories: [],
      date: '',
      shift: '',
      times: [],
    },

    copiedFileCount: 0,
    isCopying: false,
    copyError: null,

    // 操作方法
    setScannedFiles: (files) => set({ scannedFiles: files }),
    setScanningState: (isScanning) => set({ isScanning }),
    setScanError: (error) => set({ scanError: error }),

    setSelectedPlant: (plant) => set({ selectedPlant: plant }),
    setSelectedTypes: (types) => set({ selectedTypes: types }),

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
