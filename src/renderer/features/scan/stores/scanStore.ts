import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

import type { ScanCategory, ScanTask } from '@shared/ipc'

interface ScanState {
  task: ScanTask | null
  /** 创建任务请求进行中，用于禁用按钮防止连点 */
  creating: boolean
  error: string | null
  /**
   * 历史恢复的静默截止时间（毫秒时间戳）。只用于界面协调，不落盘。
   *
   * useResetOnParamChange 会在筛选签名变化时清掉上一轮结果；恢复历史恰好
   * 也会改筛选，而且筛选面板还会把历史里不在当前类型清单中的类型剪掉，
   * 造成第二次签名变化。若每次都清，刚载入的任务会立刻消失（现场表现为
   * 第一次点击面板为空、第二次才正常）。恢复后的半秒内不做清理，
   * 等界面把参数归一化完；之后用户再手动改筛选仍会照常清空。
   */
  restoreUntil: number
}

interface ScanAction {
  setTask: (task: ScanTask | null) => void
  setCreating: (creating: boolean) => void
  setError: (error: string | null) => void
  markRestored: () => void
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
        restoreUntil: 0,

        setTask: (task) => set({ task }),
        setCreating: (creating) => set({ creating }),
        setError: (error) => set({ error }),
        markRestored: () => set({ restoreUntil: Date.now() + 500 }),
      }),
      { name: `scan:${category}` },
    ),
  )

export const useElScanStore = createScanStore('el')
export const useLxtScanStore = createScanStore('lxt')
export const usePlScanStore = createScanStore('pl')
export const useAoiScanStore = createScanStore('aoi')

const stores: Record<ScanCategory, ScanStore> = {
  el: useElScanStore,
  lxt: useLxtScanStore,
  pl: usePlScanStore,
  aoi: useAoiScanStore,
}

/** 按类别取对应的扫描 store；映射穷尽，新增类别时类型检查会报错 */
export const scanStoreOf = (category: ScanCategory): ScanStore =>
  stores[category]
