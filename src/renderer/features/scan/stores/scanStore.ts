import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

import type { ScanCategory, ScanTask } from '@shared/ipc'
import { SCAN_CATEGORIES } from '@shared/scanCategories'

interface ScanState {
  task: ScanTask | null
  /** 创建任务请求进行中，用于禁用按钮防止连点 */
  creating: boolean
  error: string | null
}

interface ScanAction {
  setTask: (task: ScanTask | null) => void
  setCreating: (creating: boolean) => void
  setError: (error: string | null) => void
}

export type ScanStore = ReturnType<typeof createScanStore>

/**
 * 按扫描类别各建一个 store。
 *
 * 以前 EL 与力禧特共用一个 task 字段：在 EL 页扫完切到力禧特页，
 * 读到的还是 EL 的任务快照，两个页面的进度与结果互相串。
 * 拆开后每个页面只读写自己类别的任务，互不干扰；利珀同理。
 */
const createScanStore = (category: ScanCategory) =>
  create<ScanState & ScanAction>()(
    devtools(
      (set) => ({
        task: null,
        creating: false,
        error: null,

        setTask: (task) => set({ task }),
        setCreating: (creating) => set({ creating }),
        setError: (error) => set({ error }),
      }),
      { name: `scan:${category}` },
    ),
  )

/** 类别清单是唯一来源：加一类只需在 SCAN_CATEGORIES 里加一项 */
const stores = Object.fromEntries(
  SCAN_CATEGORIES.map((category) => [category, createScanStore(category)]),
) as Record<ScanCategory, ScanStore>

export const useElScanStore = stores.el
export const useLxtScanStore = stores.lxt
export const usePlScanStore = stores.pl
export const useAoiScanStore = stores.aoi

/** 按类别取对应的扫描 store；映射由类别清单生成，不会漏 */
export const scanStoreOf = (category: ScanCategory): ScanStore =>
  stores[category]
