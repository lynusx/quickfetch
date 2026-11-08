import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

import type { UpdateState } from '@shared/ipc'
import { toErrorMessage } from '@/utils/error'

const ACTION_FALLBACK = '更新操作失败，请稍后重试'
const OPEN_PAGE_FALLBACK = '无法打开下载页面'

interface UpdateStoreState {
  state: UpdateState | null
  loading: boolean
  actionError: string | null
}

interface UpdateStoreAction {
  load: () => Promise<void>
  /** 手动检查；返回主进程的最新状态，失败时返回 null */
  check: () => Promise<UpdateState | null>
  download: () => Promise<UpdateState | null>
  install: () => Promise<UpdateState | null>
  /** 打开 Releases 页面；成功返回 null，失败返回可读错误 */
  openReleasePage: () => Promise<string | null>
  /** 主进程 update:state 推送入口 */
  applyState: (state: UpdateState) => void
  clearActionError: () => void
}

/**
 * 自动更新状态。
 *
 * 真正的状态机在主进程；这里只缓存最近一次快照并转发操作，
 * 侧边栏与设置页共用同一份，避免两处各自轮询。
 */
export const useUpdateStore = create<UpdateStoreState & UpdateStoreAction>()(
  devtools(
    (set) => ({
      state: null,
      loading: false,
      actionError: null,

      load: async () => {
        set({ loading: true })

        try {
          set({
            state: await window.electronAPI.getUpdateState(),
            loading: false,
            actionError: null,
          })
        } catch (error) {
          set({
            loading: false,
            actionError: toErrorMessage(error, ACTION_FALLBACK),
          })
        }
      },

      check: async () => {
        try {
          const state = await window.electronAPI.checkForUpdates()

          set({ state, actionError: null })

          return state
        } catch (error) {
          set({ actionError: toErrorMessage(error, ACTION_FALLBACK) })
          return null
        }
      },

      download: async () => {
        try {
          const state = await window.electronAPI.downloadUpdate()

          set({ state, actionError: null })

          return state
        } catch (error) {
          set({ actionError: toErrorMessage(error, ACTION_FALLBACK) })
          return null
        }
      },

      install: async () => {
        try {
          const state = await window.electronAPI.installUpdate()

          set({ state, actionError: null })

          return state
        } catch (error) {
          set({ actionError: toErrorMessage(error, ACTION_FALLBACK) })
          return null
        }
      },

      openReleasePage: async () => {
        try {
          return await window.electronAPI.openUpdateReleasePage()
        } catch (error) {
          const message = toErrorMessage(error, OPEN_PAGE_FALLBACK)
          set({ actionError: message })

          return message
        }
      },

      applyState: (state) => set({ state }),

      clearActionError: () => set({ actionError: null }),
    }),
    { name: 'UpdateStore' },
  ),
)
