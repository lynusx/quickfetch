import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

import type { CopyPlanPreview, CopyTask, ScanCategory } from '@shared/ipc'
import { SCAN_CATEGORIES } from '@shared/scanCategories'

/** 两份机台名单是否完全一致（machineStats 已按自然序排好，直接比顺序即可） */
const sameMachines = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((name, index) => name === b[index])

/**
 * 复制任务的界面状态。
 *
 * 与扫描一致：任务本体留在主进程，这里只存快照。
 * 唯一的本地状态是「用户勾了哪些机台」—— 任务创建前就要用到，主进程不知道。
 * 分组方式与重名策略属于偏好，统一放在 settingsStore 里持久化。
 */
interface CopyState {
  /** 当前复制任务快照；没有复制过时为 null */
  task: CopyTask | null

  /**
   * 显式选中的机台；空数组表示一台都没选，不再兼作「全选」标记。
   *
   * 以前空数组同时表示「全选」和「一台没选」，导致取消全选无效、
   * 取消最后一台又变成全选。现在由 selectionTaskId 负责「新任务默认全选」。
   */
  machines: string[]

  /** machines 当前按哪个扫描任务同步；换任务后重新初始化 */
  selectionTaskId: string | null
  /** 用户是否手动改过勾选；没改过时，扫描过程中新出现的机台会自动补选 */
  selectionTouched: boolean

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
  /** 用户手动设置勾选（含取消全选），之后不再自动补选 */
  setMachines: (machines: string[]) => void
  toggleMachine: (machine: string) => void
  /** 显式全选当前机台；不标记为手动修改，之后新出现的机台仍会自动补选 */
  selectAll: (machines: string[]) => void
  /** 扫描任务的机台列表变化时同步；同一任务内用户改过勾选就不再覆盖 */
  syncMachines: (taskId: string, machines: string[]) => void
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
  selectionTaskId: null,
  selectionTouched: false,
  targetDir: '',
  targetName: '',
  preview: null,
  previewing: false,
  busy: false,
  error: null,
  showFailures: false,
}

export type CopyStore = ReturnType<typeof createCopyStore>

const createCopyStore = (category: ScanCategory) =>
  create<CopyState & CopyAction>()(
    devtools(
      (set) => ({
        ...initial,

        setTask: (task) => set({ task }),
        patchTask: (task) =>
          set((state) => (state.task?.id === task.id ? { task } : state)),
        setMachines: (machines) => set({ machines, selectionTouched: true }),
        toggleMachine: (machine) =>
          set((state) => ({
            machines: state.machines.includes(machine)
              ? state.machines.filter((item) => item !== machine)
              : [...state.machines, machine],
            selectionTouched: true,
          })),
        selectAll: (machines) => set({ machines, selectionTouched: false }),
        syncMachines: (taskId, machines) =>
          set((state) => {
            // 换了一个扫描任务：默认全选，用户的旧勾选不沿用
            if (state.selectionTaskId !== taskId) {
              return {
                machines,
                selectionTaskId: taskId,
                selectionTouched: false,
              }
            }

            // 同一任务内用户动过勾选：不再自动补选/覆盖
            if (state.selectionTouched) return state
            if (sameMachines(state.machines, machines)) return state

            return { machines }
          }),
        setTarget: (dir, name) => set({ targetDir: dir, targetName: name }),
        clearTarget: () => set({ targetDir: '', targetName: '' }),
        setPreview: (preview) => set({ preview }),
        setPreviewing: (previewing) => set({ previewing }),
        setBusy: (busy) => set({ busy }),
        setError: (error) => set({ error }),
        setShowFailures: (show) => set({ showFailures: show }),

        /**
         * 换任务时重置。
         *
         * 目标目录保留：用户连续复制几个任务到同一个盘是常态，每次都重选很烦。
         * 机台勾选必须清空：上一个任务勾的机台在新任务里可能一张图都没有，
         * 留着会让「已选 3/6 台 · 0 张」这种看不懂的状态出现。
         */
        reset: () =>
          set((state) => ({
            ...initial,
            targetDir: state.targetDir,
            targetName: state.targetName,
          })),
      }),
      { name: `copy:${category}` },
    ),
  )

/** 类别清单是唯一来源：加一类只需在 SCAN_CATEGORIES 里加一项 */
const stores = Object.fromEntries(
  SCAN_CATEGORIES.map((category) => [category, createCopyStore(category)]),
) as Record<ScanCategory, CopyStore>

/** 按类别取对应的复制 store；映射由类别清单生成，不会漏 */
export const copyStoreOf = (category: ScanCategory): CopyStore =>
  stores[category]
