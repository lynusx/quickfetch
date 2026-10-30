import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

import type { CopyLayout, CopyPlanPreview, CopyTask } from '../../shared/ipc'

/**
 * 复制任务的界面状态。
 *
 * 与扫描一致：任务本体留在主进程，这里只存快照。
 * 唯一的本地状态是「用户勾了哪些机台、选了哪种分组」—— 这两项在
 * 任务创建前就要用到，主进程不知道。
 */
interface CopyState {
  /** 当前复制任务快照；没有复制过时为 null */
  task: CopyTask | null

  /** 勾选要复制的机台；空数组表示全选 */
  machines: string[]
  layout: CopyLayout

  /** 已选目标目录，未选时为空 */
  targetDir: string
  /** 目标目录的显示名，比完整路径短，按钮上用 */
  targetName: string

  /** 预检查结果：会复制多少张、建哪些子目录 */
  preview: CopyPlanPreview | null
  previewing: boolean

  /** 请求进行中，用于禁用按钮防连点 */
  busy: boolean
  error: string | null

  /** 失败明细是否展开 */
  showFailures: boolean
}

interface CopyAction {
  setTask: (task: CopyTask | null) => void
  patchTask: (task: CopyTask) => void
  setMachines: (machines: string[]) => void
  toggleMachine: (machine: string) => void
  setLayout: (layout: CopyLayout) => void
  setTarget: (dir: string, name: string) => void
  clearTarget: () => void
  setPreview: (preview: CopyPlanPreview | null) => void
  setPreviewing: (previewing: boolean) => void
  setBusy: (busy: boolean) => void
  setError: (error: string | null) => void
  setShowFailures: (show: boolean) => void
  /** 换任务或重新开始时清空复制相关的全部状态 */
  reset: () => void
}

const initial = {
  task: null,
  machines: [],
  layout: 'machine' as CopyLayout,
  targetDir: '',
  targetName: '',
  preview: null,
  previewing: false,
  busy: false,
  error: null,
  showFailures: false,
}

export const useCopyStore = create<CopyState & CopyAction>()(
  devtools((set) => ({
    ...initial,

    setTask: (task) => set({ task }),
    patchTask: (task) =>
      set((state) => (state.task?.id === task.id ? { task } : state)),
    setMachines: (machines) => set({ machines }),
    toggleMachine: (machine) =>
      set((state) => ({
        machines: state.machines.includes(machine)
          ? state.machines.filter((item) => item !== machine)
          : [...state.machines, machine],
      })),
    setLayout: (layout) => set({ layout }),
    setTarget: (dir, name) => set({ targetDir: dir, targetName: name }),
    clearTarget: () => set({ targetDir: '', targetName: '' }),
    setPreview: (preview) => set({ preview }),
    setPreviewing: (previewing) => set({ previewing }),
    setBusy: (busy) => set({ busy }),
    setError: (error) => set({ error }),
    setShowFailures: (show) => set({ showFailures: show }),

    // 勾选的机台与目标目录保留：换一个扫描任务后用户往往还是要复制到同一个盘
    reset: () =>
      set((state) => ({
        ...initial,
        machines: state.machines.filter(Boolean),
        targetDir: state.targetDir,
        targetName: state.targetName,
        layout: state.layout,
      })),
  })),
)
