import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

import type { ScanProgress } from '../../shared/ipc'
import type { Image } from '../types'

interface ScanSummary {
  scannedDirs: number
  elapsedMs: number
}

interface ImageState {
  images: Image[]
  isScan: boolean
  isError: boolean
  isCopy: boolean
  error: Error | null
  copiedImageCount: number
  /** 当前扫描任务 ID，用于取消操作 */
  scanTaskId: string | null
  /** 扫描进度快照，扫描结束后清空 */
  scanProgress: ScanProgress | null
  /** 上次扫描的统计摘要，用于结果展示 */
  scanSummary: ScanSummary | null
}

interface ImageAction {
  setImages: (images: Image[]) => void
  setIsScan: (isScan: boolean) => void
  setIsError: (isError: boolean) => void
  setIsCopy: (isCopy: boolean) => void
  setError: (error: Error | null) => void
  setCopiedImageCount: (count: number) => void
  setScanTaskId: (taskId: string | null) => void
  setScanProgress: (progress: ScanProgress | null) => void
  setScanSummary: (summary: ScanSummary | null) => void
}

export const useImageStore = create<ImageState & ImageAction>()(
  devtools((set) => ({
    images: [],
    isScan: false,
    isError: false,
    isCopy: false,
    error: null,
    copiedImageCount: 0,
    scanTaskId: null,
    scanProgress: null,
    scanSummary: null,

    setImages: (images) => set({ images }),
    setIsScan: (isScan) => set({ isScan }),
    setIsError: (isError) => set({ isError }),
    setIsCopy: (isCopy) => set({ isCopy }),
    setError: (error) => set({ error }),
    setCopiedImageCount: (count) => set({ copiedImageCount: count }),
    setScanTaskId: (scanTaskId) => set({ scanTaskId }),
    setScanProgress: (scanProgress) => set({ scanProgress }),
    setScanSummary: (scanSummary) => set({ scanSummary }),
  })),
)
