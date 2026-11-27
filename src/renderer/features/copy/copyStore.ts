import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

import type {
  CopyPlanPreview,
  CopyTask,
  ScanCategory,
  ScanTask,
} from '@shared/ipc'
import { SCAN_CATEGORIES } from '@shared/scanCategories'
import { scanStoreOf } from '../scan/stores/scanStore'

const sameMachines = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((name, index) => name === b[index])

/** 从扫描任务提取有命中图片的机台（按自然序升序） */
export const hitMachinesOf = (
  task: Pick<ScanTask, 'branches'> | null,
): string[] => {
  if (!task) return []

  const counts = new Map<string, number>()
  for (const branch of task.branches) {
    counts.set(branch.machine, branch.images)
  }

  return [...counts.entries()]
    .filter(([, images]) => images > 0)
    .map(([machine]) => machine)
    .sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }))
}

export interface CopyState {
  task: CopyTask | null
  machines: string[]
  selectionTaskId: string | null
  selectionTouched: boolean
  targetDir: string
  targetName: string
  preview: CopyPlanPreview | null
  previewing: boolean
  busy: boolean
  error: string | null
  showFailures: boolean
}

export interface CopyAction {
  setTask: (task: CopyTask | null) => void
  patchTask: (task: CopyTask) => void
  setMachines: (machines: string[]) => void
  selectAll: (machines: string[]) => void
  /** 表头全选/取消：全选时还原 selectionTouched=false，使渐进扫描后续命中的机台继续自动补选 */
  toggleAll: (availableMachines: string[], checked: boolean) => void
  /** 单行勾选切换：标记为用户手动调整 */
  toggleMachine: (machine: string, checked: boolean) => void
  /**
   * 跟随本类别扫描任务快照同步：
   * - 扫描任务置空（清除结果 / 修改范围重置）或切换新 taskId 时，自动清空上一轮复制任务、错误与预览并保留目标目录；
   * - 同一扫描任务渐进产出新命中机台时，若用户未手动取消勾选则自动补选。
   */
  syncScanTask: (scanTask: Pick<ScanTask, 'id' | 'branches'> | null) => void
  setTarget: (dir: string, name: string) => void
  clearTarget: () => void
  setPreview: (preview: CopyPlanPreview | null) => void
  setPreviewing: (previewing: boolean) => void
  setBusy: (busy: boolean) => void
  setError: (error: string | null) => void
  setShowFailures: (show: boolean) => void
  reset: () => void
}

const initial: CopyState = {
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

export const createCopyStore = (category: ScanCategory) =>
  create<CopyState & CopyAction>()(
    devtools(
      (set) => ({
        ...initial,

        setTask: (task) => {
          if (task && task.category !== category) return
          set({ task })
        },
        patchTask: (task) =>
          set((state) =>
            state.task?.id === task.id && task.category === category
              ? { task }
              : state,
          ),
        setMachines: (machines) => set({ machines, selectionTouched: true }),
        selectAll: (machines) => set({ machines, selectionTouched: false }),
        toggleAll: (availableMachines, checked) =>
          set(
            checked
              ? { machines: [...availableMachines], selectionTouched: false }
              : { machines: [], selectionTouched: true },
          ),
        toggleMachine: (machine, checked) =>
          set((state) => ({
            machines: checked
              ? [...new Set([...state.machines, machine])]
              : state.machines.filter((item) => item !== machine),
            selectionTouched: true,
          })),
        syncScanTask: (scanTask) =>
          set((state) => {
            if (!scanTask) {
              const alreadyClean =
                state.task === null &&
                state.machines.length === 0 &&
                state.selectionTaskId === null &&
                !state.selectionTouched &&
                state.preview === null &&
                !state.previewing &&
                !state.busy &&
                state.error === null &&
                !state.showFailures

              if (alreadyClean) return state

              return {
                ...initial,
                targetDir: state.targetDir,
                targetName: state.targetName,
              }
            }

            const hitMachines = hitMachinesOf(scanTask)

            if (state.selectionTaskId !== scanTask.id) {
              return {
                ...initial,
                targetDir: state.targetDir,
                targetName: state.targetName,
                machines: hitMachines,
                selectionTaskId: scanTask.id,
                selectionTouched: false,
              }
            }

            if (state.selectionTouched) return state
            if (sameMachines(state.machines, hitMachines)) return state

            return { machines: hitMachines }
          }),
        setTarget: (dir, name) => set({ targetDir: dir, targetName: name }),
        clearTarget: () => set({ targetDir: '', targetName: '' }),
        setPreview: (preview) => set({ preview }),
        setPreviewing: (previewing) => set({ previewing }),
        setBusy: (busy) => set({ busy }),
        setError: (error) => set({ error }),
        setShowFailures: (show) => set({ showFailures: show }),

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

const stores: Partial<Record<ScanCategory, CopyStore>> = {}

export const copyStoreOf = (category: ScanCategory): CopyStore => {
  const existing = stores[category]
  if (existing) return existing

  const copyStore = createCopyStore(category)
  const scanStore = scanStoreOf(category)

  // 初始对账 + 持续跟随扫描任务生命周期，调用方无需再手动跨 store 调 reset()
  copyStore.getState().syncScanTask(scanStore.getState().task)
  scanStore.subscribe((state) => {
    copyStore.getState().syncScanTask(state.task)
  })

  stores[category] = copyStore
  return copyStore
}

// 确保预热类别键覆盖检查
void SCAN_CATEGORIES
