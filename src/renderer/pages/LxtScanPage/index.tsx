import { useCallback, useEffect } from 'react'
import { CircleAlert, Loader2, Pause, Play, Square, Wand2 } from 'lucide-react'

import LxtFilterPanel from '@/components/LxtFilterPanel'
import LxtMachinePicker from '@/components/LxtMachinePicker'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { useScanTask } from '@/hooks/useScanTask'
import { useToast } from '@/hooks/useToast'
import { useLxtFilterStore } from '@/stores/lxtFilterStore'
import { useScanStore } from '@/stores/scanStore'
import { selectLxt, useSettingsStore } from '@/stores/settingsStore'
import type { ScanBranch, ScanTaskStatus } from '../../../shared/ipc'
import { formatDuration, formatEta } from '@/utils/common'
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

/**
 * 力禧特图片扫描。
 *
 * 与 EL 页最大的不同是机台来源：45 台机器各自一个 IP，清单来自入口目录里
 * 的 .lnk；第二层是 el 或 SaveImages，第一台被扫到时探测并记住。
 */
const LxtScanPage = () => {
  const { showToast } = useToast()
  const lxt = useSettingsStore(selectLxt)

  const load = useSettingsStore((state) => state.load)
  useEffect(() => {
    void load()
  }, [load])

  // 参数在点击那一刻才从 store 取，避免闭包捕获上一轮的勾选
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
  } = useScanTask({
    category: 'lxt',
    showToast,
    getParams: () => {
      const filters = useLxtFilterStore.getState()

      return {
        machines: filters.selectedMachines,
        date: filters.date,
        shift: filters.shift,
        slots: filters.slots,
        types: filters.types,
      }
    },
  })

  const filters = useLxtFilterStore()
  const scanError = useScanStore((state) => state.error)

  const configured = Boolean(lxt.entryRoot)
  const active = lxt.machines.filter((item) => !item.stale)
  const ready =
    filters.selectedMachines.length > 0 &&
    filters.slots.length > 0 &&
    filters.types.length > 0 &&
    Boolean(filters.date)
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

  const resetFilters = useCallback(() => {
    useScanStore.getState().setTask(null)
  }, [])

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          力禧特图片批量拷贝
        </h1>
        {status && <Badge variant={status.variant}>{status.label}</Badge>}
      </header>

      <div className="grid items-start gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <Card className="xl:sticky xl:top-6">
          <CardHeader>
            <CardTitle>扫描范围</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <LxtMachinePicker machines={lxt.machines} />
            <Separator />
            <LxtFilterPanel />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardContent className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium">
                    {task
                      ? task.progress.phase === 'done'
                        ? STATUS_META[task.status].label
                        : PHASE_LABEL[task.progress.phase]
                      : '未开始'}
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
                  <Button
                    onClick={() => void start()}
                    disabled={!canStart || !configured}
                  >
                    {creating ? (
                      <Loader2
                        className="animate-spin"
                        data-icon="inline-start"
                      />
                    ) : (
                      <Wand2 data-icon="inline-start" />
                    )}
                    开始扫描
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
                <Button
                  variant="outline"
                  onClick={() => void start()}
                  disabled={!canStart || !configured || busy}
                >
                  <Wand2 data-icon="inline-start" />
                  重扫一遍
                </Button>
                {task && !busy && (
                  <Button variant="ghost" onClick={resetFilters}>
                    清除结果
                  </Button>
                )}
              </div>

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
                  <AlertTitle>先配置力禧特入口</AlertTitle>
                  <AlertDescription>
                    在左侧选择入口目录，应用会解析其中的快捷方式并识别各厂区机台
                  </AlertDescription>
                </Alert>
              )}

              {configured && !active.length && (
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
                  <AlertDescription>
                    接入力禧特专用内网后点击「继续」，已扫描的结果不会丢失
                  </AlertDescription>
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
                                ? 'text-foreground'
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
        </div>
      </div>
    </div>
  )
}

export default LxtScanPage
