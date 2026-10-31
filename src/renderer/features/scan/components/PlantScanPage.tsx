import { useCallback, type ReactNode } from 'react'
import {
  CircleAlert,
  Download,
  Loader2,
  Pause,
  Play,
  Square,
  Wand2,
} from 'lucide-react'

import { CopyPanel } from '@/features/copy'
import { HistoryPanel } from '@/features/history'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { useHistoryRestore } from '../hooks/useHistoryRestore'
import { useScanTask } from '../hooks/useScanTask'
import { useToast } from '@/hooks/useToast'
import { scanStoreOf } from '../stores/scanStore'
import { useSettingsStore } from '@/features/settings'
import type {
  ScanBranch,
  ScanCategory,
  ScanTaskParams,
  ScanTaskStatus,
} from '@shared/ipc'
import { formatDuration, formatEta } from '@/utils/common'
import { DEFAULT_HISTORY_LIMIT } from '@shared/historyLimit'
import { cn } from '@/lib/utils'

const STATUS_META: Record<
  ScanTaskStatus,
  {
    label: string
    variant: 'default' | 'secondary' | 'destructive' | 'outline'
  }
> = {
  pending: { label: '待开始', variant: 'outline' },
  running: { label: '进行中', variant: 'secondary' },
  paused: { label: '已暂停', variant: 'outline' },
  completed: { label: '已完成', variant: 'default' },
  canceled: { label: '已取消', variant: 'outline' },
  interrupted: { label: '已中断', variant: 'outline' },
  failed: { label: '失败', variant: 'destructive' },
}

const PHASE_LABEL: Record<string, string> = {
  probe: '探测目录',
  collect: '收集图片',
  done: '已结束',
}

const branchText = (branch: ScanBranch): string => {
  if (branch.message) return branch.message
  if (branch.status === 'hit')
    return `${branch.images} 张 · ${branch.matchedDirs} 个目录`
  if (branch.status === 'skipped') return '未探测'
  return '无图片'
}

interface PlantScanPageProps {
  category: ScanCategory
  /** 页面标题，如「力禧特图片批量拷贝」 */
  title: string
  /** 入口未配置时的引导文案 */
  unconfigured: { title: string; description: string }
  /** 断网自动暂停时的说明，两类走的网络不同 */
  networkHint: string
  configured: boolean
  /** 入口里可用（未标 stale）的机台数 */
  activeMachines: number
  /** 机台、日期、班次、时段、类型（利珀还有等级）是否都选好了 */
  ready: boolean
  /** 还差哪些项没选，用于在按钮旁说清楚为什么点不动（类型默认空，缺它最常见） */
  missing?: string[]
  /** 点击那一刻才取参数，避免闭包捕获上一轮勾选 */
  getParams: () => Omit<ScanTaskParams, 'category'>
  /** 左侧「扫描范围」卡片里的两块内容 */
  picker: ReactNode
  filterPanel: ReactNode
}

/**
 * 「厂区 / 机台」类扫描页的公共骨架。
 *
 * 力禧特与利珀除了路径层级与网络不同，界面结构、进度、诊断、复制入口
 * 完全一致，所以合成一个页面骨架，两侧分别注入自己的选择器与筛选面板。
 * 单个类别的扫描状态仍然各自独立（scanStore / copyStore 按类别分开）。
 */
const PlantScanPage = ({
  category,
  title,
  unconfigured,
  networkHint,
  configured,
  activeMachines,
  ready,
  missing,
  getParams,
  picker,
  filterPanel,
}: PlantScanPageProps) => {
  const { showToast } = useToast()
  const store = scanStoreOf(category)

  const {
    task,
    creating,
    busy,
    other,
    otherLabel,
    error,
    start,
    pause,
    resume,
    cancel,
  } = useScanTask({ category, showToast, getParams })

  const scanError = store((state) => state.error)

  const historyLimit = useSettingsStore(
    (state) => state.settings?.historyLimit ?? DEFAULT_HISTORY_LIMIT,
  )
  const saveHistoryLimit = useSettingsStore((state) => state.saveHistoryLimit)
  const restoreHistory = useHistoryRestore(category)

  const canStart = ready && !busy && !creating && !other

  const status = task ? STATUS_META[task.status] : null
  const branches = task?.branches ?? []
  const abnormal = branches.filter(
    (branch) => branch.status !== 'hit' && branch.status !== 'empty',
  )
  // 不可达的机器单独统计：现场最常见的失败是没接专用内网
  const unreachable = branches.filter(
    (branch) => branch.unreachableReason === 'network',
  ).length
  const eta =
    task && task.status === 'running' ? formatEta(task.progress.etaMs) : null

  const clearResult = useCallback(() => {
    store.getState().setTask(null)
  }, [store])

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {status && <Badge variant={status.variant}>{status.label}</Badge>}
      </header>

      <div className="grid items-start gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <Card className="xl:sticky xl:top-6">
          <CardHeader>
            <CardTitle>扫描范围</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {picker}
            <Separator />
            {filterPanel}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>扫描进度</CardTitle>
              <CardDescription>
                {task
                  ? task.status === 'interrupted'
                    ? '上次退出时保存，点「开始扫描」可按原参数重扫'
                    : task.progress.phase === 'done'
                      ? STATUS_META[task.status].label
                      : PHASE_LABEL[task.progress.phase]
                  : '尚未开始扫描'}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium text-muted-foreground">
                    完成进度
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {task?.progress.percent ?? 0}%
                  </span>
                </div>
                <Progress value={task?.progress.percent ?? 0} />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="tabular-nums">
                    读取 {task?.progress.dirsScanned ?? 0} 个目录 · 跳过{' '}
                    {task?.progress.dirsSkipped ?? 0}
                    {unreachable > 0 && ` · 不可达 ${unreachable} 台`}
                  </span>
                  <span className="tabular-nums">
                    命中 {task?.totalImages ?? 0} 张
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  {task && task.progress.batchTotal > 0 && (
                    <span className="tabular-nums">
                      第 {task.progress.batchIndex}/{task.progress.batchTotal}{' '}
                      批
                    </span>
                  )}
                  {task && task.progress.concurrency > 0 && (
                    <span className="tabular-nums">
                      并发 {task.progress.concurrency}
                    </span>
                  )}
                  {eta && <span className="tabular-nums">剩余 {eta}</span>}
                </div>
                {task?.progress.currentPath && (
                  <p
                    className="truncate font-mono text-[11px] text-muted-foreground"
                    title={task.progress.currentPath}
                  >
                    {task.progress.currentPath}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {!busy ? (
                  <Button onClick={() => void start()} disabled={!canStart}>
                    {creating ? (
                      <Loader2
                        className="animate-spin"
                        data-icon="inline-start"
                      />
                    ) : (
                      <Wand2 data-icon="inline-start" />
                    )}
                    {task ? '重新扫描' : '开始扫描'}
                  </Button>
                ) : (
                  <>
                    {task?.status === 'paused' ? (
                      <Button onClick={() => void resume()}>
                        <Play data-icon="inline-start" />
                        继续
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        onClick={() => void pause()}
                        disabled={task?.status !== 'running'}
                      >
                        <Pause data-icon="inline-start" />
                        暂停
                      </Button>
                    )}
                    <Button variant="outline" onClick={() => void cancel()}>
                      <Square data-icon="inline-start" />
                      取消
                    </Button>
                  </>
                )}
                {task && !busy && (
                  <Button variant="ghost" onClick={clearResult}>
                    清除结果
                  </Button>
                )}
              </div>

              {!ready && !busy && missing?.length ? (
                <p className="text-xs text-muted-foreground">
                  还需要选择{missing.join('、')}，选齐后才能开始扫描
                </p>
              ) : null}

              {other && otherLabel && (
                <Alert>
                  <CircleAlert />
                  <AlertTitle>另一类扫描正在进行</AlertTitle>
                  <AlertDescription>{otherLabel}</AlertDescription>
                </Alert>
              )}

              {!configured && (
                <Alert>
                  <CircleAlert />
                  <AlertTitle>{unconfigured.title}</AlertTitle>
                  <AlertDescription>
                    {unconfigured.description}
                  </AlertDescription>
                </Alert>
              )}

              {configured && !activeMachines && (
                <Alert>
                  <CircleAlert />
                  <AlertTitle>入口里没有可用机台</AlertTitle>
                  <AlertDescription>
                    请确认快捷方式的目标是网络路径（\\主机），本地路径会被跳过
                  </AlertDescription>
                </Alert>
              )}

              {task?.status === 'paused' && task.pauseReason === 'network' && (
                <Alert variant="destructive">
                  <CircleAlert />
                  <AlertTitle>机台不可达，任务已暂停</AlertTitle>
                  <AlertDescription>{networkHint}</AlertDescription>
                </Alert>
              )}

              {(scanError || error || task?.error) && (
                <Alert variant="destructive">
                  <CircleAlert />
                  <AlertTitle>扫描失败</AlertTitle>
                  <AlertDescription>
                    {scanError ?? error ?? task?.error}
                  </AlertDescription>
                </Alert>
              )}

              {task && task.status !== 'pending' && (
                <>
                  <Separator />
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">各机台结果</span>
                      <span className="tabular-nums text-muted-foreground">
                        {formatDuration(task.elapsedMs)}
                        {abnormal.length > 0 &&
                          ` · ${abnormal.length} 台无结果`}
                      </span>
                    </div>
                    <div className="max-h-80 overflow-y-auto rounded-lg border">
                      {branches.map((branch) => (
                        <div
                          key={branch.machine}
                          className="flex items-center gap-3 border-b px-3 py-2 text-xs last:border-b-0"
                        >
                          <span className="w-28 shrink-0 truncate font-mono">
                            {branch.machine}
                          </span>
                          <span
                            className={cn(
                              'min-w-0 flex-1 truncate',
                              branch.status === 'hit'
                                ? 'text-muted-foreground'
                                : branch.unreachableReason === 'network'
                                  ? 'font-medium text-destructive'
                                  : 'text-muted-foreground/80',
                            )}
                            title={branchText(branch)}
                          >
                            {branchText(branch)}
                          </span>
                          <span
                            className={cn(
                              'shrink-0 tabular-nums',
                              branch.status === 'hit'
                                ? 'font-medium text-foreground'
                                : 'text-muted-foreground',
                            )}
                          >
                            {branch.images > 0 ? `${branch.images} 张` : '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="size-4" />
                复制到本地
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CopyPanel category={category} showToast={showToast} />
            </CardContent>
          </Card>

          <HistoryPanel
            category={category}
            onRestore={(item) => void restoreHistory(item)}
            showToast={showToast}
            activeId={task?.id ?? null}
            activeStatus={task?.status ?? null}
            limit={historyLimit}
            onLimitChange={(limit) => void saveHistoryLimit(limit)}
          />
        </div>
      </div>
    </div>
  )
}

export default PlantScanPage
