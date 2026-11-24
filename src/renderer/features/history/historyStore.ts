import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

import type { ScanHistoryItem } from '@shared/ipc'

interface HistoryState {
  items: ScanHistoryItem[]
  /** 是否已完成过至少一次拉取；避免切换扫描页时重复进入 loading 闪烁 */
  loaded: boolean
  /** 首次加载中；之后刷新走 refreshing，避免列表闪烁 */
  loading: boolean
  refreshing: boolean
  error: string | null
  /** 正在载入的历史任务 id，用于按钮 loading 态 */
  loadingTaskId: string | null
}

interface HistoryAction {
  load: (silent?: boolean) => Promise<void>
  remove: (taskId: string) => Promise<void>
  clear: () => Promise<void>
  setLoadingTask: (taskId: string | null) => void
  setError: (error: string | null) => void
}

/** 复用进行中的列表请求，避免并发 load 互相覆盖 loading/refreshing 状态 */
let inFlightLoad: Promise<void> | null = null

/**
 * 历史记录列表。
 *
 * 只存摘要（id、参数、统计），不带 branches 与全量图片 ——
 * 十次任务的图片路径加起来可能是几万条，列表页用不到。
 */
export const useHistoryStore = create<HistoryState & HistoryAction>()(
  devtools((set, get) => ({
    items: [],
    loaded: false,
    loading: false,
    refreshing: false,
    error: null,
    loadingTaskId: null,

    load: async (silent = false) => {
      if (inFlightLoad) return inFlightLoad

      const useSilent = silent || get().loaded

      set(useSilent ? { refreshing: true } : { loading: true, error: null })

      inFlightLoad = (async () => {
        try {
          const items = await window.electronAPI.listScanHistory()
          set({ items, loaded: true, error: null })
        } catch (cause) {
          set({ error: (cause as Error)?.message ?? '读取历史记录失败' })
        } finally {
          inFlightLoad = null
          set({ loading: false, refreshing: false })
        }
      })()

      return inFlightLoad
    },

    remove: async (taskId) => {
      // 先用本地列表即时反馈，主进程返回后再对齐一次
      const previous = get().items

      set({ items: previous.filter((item) => item.id !== taskId) })

      try {
        const items = await window.electronAPI.deleteScanHistory(taskId)
        set({ items })
      } catch (cause) {
        set({
          items: previous,
          error: (cause as Error)?.message ?? '删除历史记录失败',
        })
      }
    },

    clear: async () => {
      set({ items: [] })

      try {
        const items = await window.electronAPI.clearScanHistory()
        set({ items })
      } catch (cause) {
        set({ error: (cause as Error)?.message ?? '清空历史记录失败' })
        await get().load(true)
      }
    },

    setLoadingTask: (loadingTaskId) => set({ loadingTaskId }),
    setError: (error) => set({ error }),
  })),
)
