import { useMemo, useState } from 'react'
import {
  CheckCircle2,
  CircleAlert,
  Download,
  FolderOpen,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Square,
} from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { useImageCopy } from '@/hooks/useImageCopy'
import { useCopyStore } from '@/stores/copyStore'
import type {
  CopyConflictPolicy,
  CopyLayout,
  CopyStatus,
} from '../../../shared/ipc'
import { COPY_CONFLICT_LABEL, COPY_LAYOUT_LABEL } from '../../../shared/ipc'
import { formatDuration, formatEta } from '@/utils/common'
import { cn } from '@/lib/utils'

const STATUS_META: Record<
  CopyStatus,
  {
    label: string
    variant: 'default' | 'secondary' | 'destructive' | 'outline'
  }
> = {
  pending: { label: '待开始', variant: 'outline' },
  running: { label: '复制中', variant: 'secondary' },
  paused: { label: '已暂停', variant: 'outline' },
  completed: { label: '已完成', variant: 'default' },
  canceled: { label: '已取消', variant: 'outline' },
  failed: { label: '失败', variant: 'destructive' },
}

const LAYOUTS: CopyLayout[] = ['flat', 'machine', 'type', 'machine-type']

/** 跟在「将…」后面的动词，别直接拼「跳过已存在」这种标签原文 */
const CONFLICT_VERB: Record<CopyConflictPolicy, string> = {
  rename: '自动编号后全部复制',
  skip: '整组跳过',
  overwrite: '覆盖',
}

/** 分组方式的直观说明：光看「按机台+类型分组」不知道会建几层目录 */
const LAYOUT_HINT: Record<CopyLayout, string> = {
  flat: '全部直接放在目标目录下',
  machine: '目标目录/A01-A/图片',
  type: '目标目录/NG_脏污_B/图片',
  'machine-type': '目标目录/A01-A/NG_脏污_B/图片',
}

const CONFLICT_HINT: Record<CopyConflictPolicy, string> = {
  rename: '重名编号，一张不少',
  skip: '有同名就整组不复制',
  overwrite: '覆盖目标，不可撤销',
}

const CONFLICTS: CopyConflictPolicy[] = ['rename', 'skip', 'overwrite']

interface CopyPanelProps {
  showToast: (
    title: string,
    message: string,
    type: 'success' | 'error' | 'info',
  ) => void
}

/**
 * 复制面板。
 *
 * 三段顺序固定：目标目录 → 勾选机台 → 分组与启动。
 * 目录放在最上面是因为它是硬前置：没选目录就不该让用户点开始。
 */
const CopyPanel = ({ showToast }: CopyPanelProps) => {
  const {
    machineStats,
    pickedCount,
    preview,
    previewing,
    targetDir,
    busy,
    error,
    running,
    paused,
    percent,
    canCopy,
    handleStart,
    handlePause,
    handleResume,
    handleCancel,
    handleRetry,
    handleChangeTarget,
    handleReveal,
    handlePickTarget,
  } = useImageCopy({ showToast })

  const machines = useCopyStore((state) => state.machines)
  const layout = useCopyStore((state) => state.layout)
  const conflict = useCopyStore((state) => state.conflict)
  const showFailures = useCopyStore((state) => state.showFailures)
  const toggleMachine = useCopyStore((state) => state.toggleMachine)
  const setMachines = useCopyStore((state) => state.setMachines)
  const setLayout = useCopyStore((state) => state.setLayout)
  const setConflict = useCopyStore((state) => state.setConflict)
  const setShowFailures = useCopyStore((state) => state.setShowFailures)

  const task = useCopyStore((state) => state.task)

  /** 覆盖策略下的确认弹窗；确认后才真正开始 */
  const [confirmOverwrite, setConfirmOverwrite] = useState(false)

  const allPicked = machines.length === 0
  const meta = task ? STATUS_META[task.status] : null
  const finished = task
    ? task.status === 'completed' ||
      task.status === 'canceled' ||
      task.status === 'failed'
    : false

  const eta = useMemo(
    () =>
      task && task.status === 'running' ? formatEta(task.progress.etaMs) : null,
    [task],
  )

  const activeDir = task?.progress.targetDir ?? targetDir
  const activeDirName = activeDir.split(/[\\/]/).filter(Boolean).pop() ?? ''

  if (!machineStats.length) {
    return (
      <Alert>
        <CircleAlert />
        <AlertTitle>暂无可复制的图片</AlertTitle>
        <AlertDescription>
          完成一次扫描并命中图片后，这里会出现机台列表供勾选复制
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ---------------------------------------------------------- 目标目录 */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">
            目标目录
            <span className="ml-1 text-xs font-normal text-destructive">*</span>
          </span>
          {activeDir && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => void handleReveal()}
            >
              <FolderOpen data-icon="inline-start" />
              打开
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div
            className={cn(
              'flex h-9 min-w-0 flex-1 items-center rounded-md border px-3 text-xs',
              activeDir
                ? 'bg-muted/40 font-mono'
                : 'border-dashed text-muted-foreground',
            )}
            title={activeDir || undefined}
          >
            <span className="truncate">
              {activeDir || '尚未选择，开始复制前必须先选择'}
            </span>
          </div>
          {/* 判禁用只看「有没有任务在跑」。这里原来还要求 finished，
              而 finished 依赖已有复制任务 —— 首次进来按钮是灰的，
              与「开始复制前必须先选目录」正好打架 */}
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            disabled={busy || running || paused}
            onClick={() =>
              void (task && finished && task.progress.targetDir
                ? handleChangeTarget()
                : handlePickTarget())
            }
            title={
              running || paused
                ? '复制进行中不能更换目录'
                : finished
                  ? '更换目录并按原勾选完整重跑一次'
                  : '选择复制目标目录'
            }
          >
            {activeDir ? '更换' : '选择目录'}
          </Button>
        </div>

        {!activeDir && (
          <p className="text-[11px] text-muted-foreground">
            复制前必须选好目标目录，主进程不会自己弹框，避免对话框关掉了任务却已经开始。
          </p>
        )}
      </div>

      <Separator />

      {/* ---------------------------------------------------------- 勾选机台 */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">要复制的机台</span>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="tabular-nums">
              已选 {allPicked ? machineStats.length : machines.length}/
              {machineStats.length} 台 · {pickedCount} 张
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() =>
                setMachines(
                  allPicked ? [] : machineStats.map((item) => item.machine),
                )
              }
            >
              {allPicked ? '取消全选' : '全选'}
            </Button>
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground">
          不勾选任何机台等同于复制全部机台的图片。
        </p>

        <div className="grid max-h-56 grid-cols-2 gap-x-3 gap-y-1 overflow-y-auto rounded-lg border p-2 sm:grid-cols-3">
          {machineStats.map((item) => {
            const checked = allPicked || machines.includes(item.machine)

            return (
              <label
                key={item.machine}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted/60',
                  running && 'cursor-not-allowed opacity-60',
                )}
              >
                <Checkbox
                  checked={checked}
                  disabled={running || paused}
                  onCheckedChange={() => {
                    // 从「全选（空数组）」切到单选时，要先把所有机台摊平再取反，
                    // 否则会出现「取消一个机台却变成只勾那一个」
                    if (allPicked) {
                      const rest = machineStats
                        .map((entry) => entry.machine)
                        .filter((name) => name !== item.machine)

                      setMachines(rest)
                      return
                    }

                    toggleMachine(item.machine)
                  }}
                />
                <span className="min-w-0 flex-1 truncate font-mono">
                  {item.machine}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {item.images}
                </span>
              </label>
            )
          })}
        </div>
      </div>

      <Separator />

      {/* ---------------------------------------------------------- 分组方式 */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">分组方式</span>
          {previewing && (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {LAYOUTS.map((value) => (
            <button
              key={value}
              type="button"
              disabled={running || paused}
              onClick={() => setLayout(value)}
              className={cn(
                'flex flex-col gap-0.5 rounded-lg border px-3 py-2 text-left text-xs transition-colors',
                layout === value
                  ? 'border-primary bg-primary/5'
                  : 'hover:bg-muted/60',
                (running || paused) && 'cursor-not-allowed opacity-60',
              )}
            >
              <span className="font-medium">{COPY_LAYOUT_LABEL[value]}</span>
              <span className="truncate font-mono text-[10px] text-muted-foreground">
                {LAYOUT_HINT[value]}
              </span>
            </button>
          ))}
        </div>

        {preview && (
          <p className="text-[11px] text-muted-foreground">
            将复制{' '}
            <span className="tabular-nums font-medium text-foreground">
              {preview.total}
            </span>{' '}
            张
            {preview.folders.length > 0
              ? `，创建 ${preview.folders.length} 个分组目录`
              : '，全部平铺在目标目录下'}
            {preview.folders.length > 0 && (
              <span className="ml-1 font-mono">
                （{preview.folders.slice(0, 3).join('、')}
                {preview.folders.length > 3 ? '…' : ''}）
              </span>
            )}
            {preview.conflicts > 0 && (
              <span
                className={cn(
                  'ml-1 font-medium',
                  conflict === 'overwrite'
                    ? 'text-destructive'
                    : 'text-amber-600 dark:text-amber-500',
                )}
              >
                ；命中 {preview.conflicts} 个同名文件，将
                {CONFLICT_VERB[conflict]}
              </span>
            )}
          </p>
        )}
      </div>

      <Separator />

      {/* ---------------------------------------------------------- 重名策略 */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">重名文件</span>

        <div className="grid grid-cols-3 gap-2">
          {CONFLICTS.map((value) => (
            <button
              key={value}
              type="button"
              disabled={running || paused}
              onClick={() => setConflict(value)}
              className={cn(
                'flex flex-col gap-0.5 rounded-lg border px-2 py-2 text-left text-xs transition-colors',
                conflict === value
                  ? value === 'overwrite'
                    ? 'border-destructive bg-destructive/5'
                    : 'border-primary bg-primary/5'
                  : 'hover:bg-muted/60',
                (running || paused) && 'cursor-not-allowed opacity-60',
              )}
            >
              <span className="font-medium">{COPY_CONFLICT_LABEL[value]}</span>
              <span className="whitespace-nowrap text-[10px] leading-tight text-muted-foreground">
                {CONFLICT_HINT[value]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ---------------------------------------------------------- 控制按钮 */}
      <div className="flex flex-wrap items-center gap-2">
        {!running && !paused ? (
          <Button
            onClick={() => {
              // 覆盖会不可逆地改掉已有文件，先让用户看清会覆盖多少张
              if (conflict === 'overwrite' && (preview?.conflicts ?? 0) > 0) {
                setConfirmOverwrite(true)
                return
              }

              void handleStart()
            }}
            disabled={!canCopy}
          >
            {busy ? (
              <Loader2 className="animate-spin" data-icon="inline-start" />
            ) : (
              <Download data-icon="inline-start" />
            )}
            {finished ? '重新复制' : '开始复制'}
          </Button>
        ) : (
          <>
            {paused ? (
              <Button onClick={() => void handleResume()} disabled={busy}>
                <Play data-icon="inline-start" />
                继续
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => void handlePause()}
                disabled={busy}
              >
                <Pause data-icon="inline-start" />
                暂停
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => void handleCancel()}
              disabled={busy}
            >
              <Square data-icon="inline-start" />
              取消
            </Button>
          </>
        )}

        {finished && (task?.progress.failed ?? 0) > 0 && (
          <Button
            variant="outline"
            onClick={() => void handleRetry()}
            disabled={busy}
          >
            <RotateCcw data-icon="inline-start" />
            重试失败项（{task?.progress.failed}）
          </Button>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>复制失败</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* ---------------------------------------------------------- 进度 */}
      {task && (
        <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2 font-medium">
              {meta && <Badge variant={meta.variant}>{meta.label}</Badge>}
              {task.progress.batchTotal > 1 && (
                <span className="font-normal tabular-nums text-muted-foreground">
                  第 {task.progress.batchIndex}/{task.progress.batchTotal} 批
                </span>
              )}
            </span>
            <span className="tabular-nums text-muted-foreground">
              {/* 有跳过项时按「已完成」计，否则「55 / 60 张 · 跳过 6」会被读成只做了 55 张 */}
              {task.progress.skipped > 0
                ? `已完成 ${task.progress.copied + task.progress.failed + task.progress.skipped} / ${task.progress.total} 张`
                : `${task.progress.copied} / ${task.progress.total} 张`}
              {task.progress.skipped > 0 && ` · 跳过 ${task.progress.skipped}`}
              {task.progress.failed > 0 && ` · 失败 ${task.progress.failed}`}
              {task.progress.renamed > 0 && ` · 改名 ${task.progress.renamed}`}
            </span>
          </div>

          <Progress value={percent} />

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span className="tabular-nums">
              {formatDuration(task.progress.elapsedMs)}
            </span>
            {eta && <span className="tabular-nums">剩余 {eta}</span>}
            <span
              className="truncate font-mono"
              title={task.progress.currentPath}
            >
              {task.progress.currentPath}
            </span>
          </div>

          {task.status === 'completed' &&
            task.progress.targetDir &&
            activeDirName && (
              <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <CheckCircle2 className="size-3.5 text-emerald-600" />
                已写入{' '}
                <span className="font-mono" title={task.progress.targetDir}>
                  {task.progress.targetDir}
                </span>
              </p>
            )}

          {task.manifestPath && (
            <p className="truncate text-[11px] text-muted-foreground">
              清单：
              <span className="font-mono">{task.manifestPath}</span>
            </p>
          )}

          {task.failures.length > 0 && (
            <div className="flex flex-col gap-1">
              <button
                type="button"
                className="self-start text-[11px] text-destructive hover:underline"
                onClick={() => setShowFailures(!showFailures)}
              >
                {showFailures
                  ? '收起失败明细'
                  : `查看失败明细（${task.failures.length}）`}
              </button>
              {showFailures && (
                <div className="max-h-40 overflow-y-auto rounded border bg-background">
                  {task.failures.map((failure) => (
                    <div
                      key={`${failure.path}-${failure.to}`}
                      className="border-b px-2 py-1 text-[11px] last:border-b-0"
                    >
                      <p className="truncate font-mono" title={failure.path}>
                        {failure.path}
                      </p>
                      <p
                        className="truncate text-destructive"
                        title={failure.reason}
                      >
                        {failure.reason}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <Dialog open={confirmOverwrite} onOpenChange={setConfirmOverwrite}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认覆盖已有文件？</DialogTitle>
            <DialogDescription>
              目标目录里已经存在 {preview?.conflicts ?? 0} 个同名文件，
              继续会用源文件覆盖它们，覆盖后无法撤销。
            </DialogDescription>
          </DialogHeader>
          <p className="truncate rounded-md bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">
            {activeDir}
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOverwrite(false)}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => {
                setConfirmOverwrite(false)
                void handleStart()
              }}
            >
              确认覆盖
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default CopyPanel
