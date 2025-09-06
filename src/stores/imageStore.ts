import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

import type { Image } from '../types'

interface ImageState {
  images: Image[]
  isScan: boolean
  isError: boolean
  isCopy: boolean
  error: Error | null
  copiedImageCount: number
}

interface ImageAction {
  setImages: (images: Image[]) => void
  setIsScan: (isScan: boolean) => void
  setIsError: (isError: boolean) => void
  setIsCopy: (isCopy: boolean) => void
  setError: (error: Error | null) => void
  setCopiedImageCount: (count: number) => void
}

export const useImageStore = create<ImageState & ImageAction>()(
  devtools((set) => ({
    images: [],
    isScan: false,
    isError: false,
    isCopy: false,
    error: null,
    copiedImageCount: 0,

    setImages: (images) => set({ images }),
    setIsScan: (isScan) => set({ isScan }),
    setIsError: (isError) => set({ isError }),
    setIsCopy: (isCopy) => set({ isCopy }),
    setError: (error) => set({ error }),
    setCopiedImageCount: (count) => set({ copiedImageCount: count }),
  })),
)
