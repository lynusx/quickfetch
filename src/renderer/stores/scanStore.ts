import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

import type { ScanTask } from '../../shared/ipc'

interface CopyState {
  running: boolean
  copied: number
  total: number
  failed: number
}

interface ScanState {
  task: ScanTask | null
  /** 创建任务请求进行中，用于禁用按钮防止连点 */
  creating: boolean
  error: string | null
  copy: CopyState | null
}

interface ScanAction {
  setTask: (task: ScanTask | null) => void
  setCreating: (creating: boolean) => void
  setError: (error: string | null) => void
  setCopy: (copy: CopyState | null) => void
  patchCopy: (patch: Partial<CopyState>) => void
}

/**
 * 当前扫描任务的快照镜像。
 * 图片全量留在主进程，这里只有统计与前 200 条预览 —— 几万条对象塞进
 * zustand 会让每次 devtools 序列化都卡住。
 */
export const useScanStore = create<ScanState & ScanAction>()(
  devtools((set) => ({
    task: null,
    creating: false,
    error: null,
    copy: null,

    setTask: (task) => set({ task }),
    setCreating: (creating) => set({ creating }),
    setError: (error) => set({ error }),
    setCopy: (copy) => set({ copy }),
    patchCopy: (patch) =>
      set((state) => ({
        copy: state.copy ? { ...state.copy, ...patch } : null,
      })),
  })),
)
