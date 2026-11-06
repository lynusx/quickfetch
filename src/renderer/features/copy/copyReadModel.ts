import type { CopyPlanPreview, CopyTask } from '@shared/ipc'
import { formatFileSize } from '@/utils/common'

export interface CopyMachineStat {
  machine: string
  images: number
}

/**
 * 「要复制的机台」标题行里的体积文案。
 *
 * - 重算中显示「计算中…」，避免拿上一次勾选的旧体积配这一次的张数
 * - 全部 stat 失败（或超过 5000 张跳过量测）显示「大小未知」，不要显示 0 Bytes
 * - 部分失败时显示已知部分之和
 * - 没有预检查结果（一台都没选）时不显示
 */
export const previewSizeLabel = (
  preview: CopyPlanPreview | null,
  previewing: boolean,
): string | null => {
  if (previewing) return '计算中…'
  if (!preview) return null
  if (preview.total > 0 && preview.sizeUnknown >= preview.total) {
    return '大小未知'
  }

  return formatFileSize(preview.totalBytes)
}

export interface CopyReadModelInput {
  task: CopyTask | null
  /** 用户显式勾选的机台；空数组表示一台都没选 */
  machines: string[]
  machineStats: CopyMachineStat[]
  targetDir: string
}

export interface CopyReadModel {
  selectedCount: number
  allSelected: boolean
  pickedCount: number
  running: boolean
  paused: boolean
  finished: boolean
  /** 运行/暂停时以任务实际目录为准，其余优先显示这次选的目录 */
  activeDir: string
  /** 已完成项：copied + failed + skipped + alreadyExists */
  done: number
  percent: number
}

/**
 * 复制面板与进度视图共享的 read model。
 *
 * 以前 percent、selectedCount、activeDir、done 分别在 useImageCopy、
 * CopyPanel、CopyProgress 各算一次，优先级还略有不同；这里只算一次。
 */
export const deriveCopyReadModel = (
  input: CopyReadModelInput,
): CopyReadModel => {
  const { task, machines, machineStats, targetDir } = input
  const selectedStats = machineStats.filter((item) =>
    machines.includes(item.machine),
  )
  const selectedCount = selectedStats.length
  const pickedCount = selectedStats.reduce((sum, item) => sum + item.images, 0)
  const allSelected =
    machineStats.length > 0 && selectedCount === machineStats.length

  const running = task?.status === 'running' || task?.status === 'pending'
  const paused = task?.status === 'paused'
  const finished = task
    ? task.status === 'completed' ||
      task.status === 'canceled' ||
      task.status === 'failed'
    : false

  const activeDir =
    (running || paused ? task?.progress.targetDir : null) ||
    targetDir ||
    task?.progress.targetDir ||
    ''

  const progress = task?.progress
  const done = progress
    ? progress.copied +
      progress.failed +
      progress.skipped +
      progress.alreadyExists
    : 0
  const percent =
    progress && progress.total > 0
      ? Math.round((done / progress.total) * 100)
      : 0

  return {
    selectedCount,
    allSelected,
    pickedCount,
    running,
    paused,
    finished,
    activeDir,
    done,
    percent,
  }
}
