import { useCallback } from 'react'
import {
  CircleAlert,
  Download,
  Loader2,
  Pause,
  Play,
  Square,
  Wand2,
} from 'lucide-react'

import CopyPanel from '@/components/CopyPanel'
import HistoryPanel from '@/components/HistoryPanel'
import ImageFilterPanel from '@/components/ImageFilterPanel'
import ScanSetupPanel from '@/components/ScanSetupPanel'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { useScanTask } from '@/hooks/useScanTask'
import { useToast } from '@/hooks/useToast'
import { useCopyStore } from '@/stores/copyStore'
import { useImageFilterStore } from '@/stores/imageFilterStore'
import { useScanStore } from '@/stores/scanStore'
import { useSettingsStore } from '@/stores/settingsStore'
import type {
  ScanBranch,
  ScanHistoryItem,
  ScanTaskStatus,
} from '../../../shared/ipc'
import { formatDuration, formatEta } from '@/utils/common'
import { toErrorMessage } from '@/utils/error'
import { DEFAULT_HISTORY_LIMIT } from '../../../shared/historyLimit'
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

const ImageCopyPage = () => {
  const { showToast } = useToast()
  const { task, creating, busy, canStart, start, pause, resume, cancel } =
    useScanTask({ showToast })

  const settingsError = useSettingsStore((state) => state.error)
  const settings = useSettingsStore((state) => state.settings)
  const saveHistoryLimit = useSettingsStore((state) => state.saveHistoryLimit)
  const scanError = useScanStore((state) => state.error)
  const historyLimit = settings?.historyLimit ?? DEFAULT_HISTORY_LIMIT

  /**
   * 载入历史任务：把参数回填到筛选面板，再替换当前任务快照。
   *
   * 参数必须回填 —— 否则界面上显示的是「今天 / 白班」，结果却是上周的，
   * 用户点「开始扫描」时很容易按错误参数重跑。
   */
  const restoreHistory = useCallback(
    async (item: ScanHistoryItem) => {
      try {
        const loaded = await window.electronAPI.loadScanHistory(item.id)

        if (!loaded) {
          showToast(
            '记录已失效',
            '该历史记录的结果文件已不存在，请重新扫描',
            'error',
          )
          return
        }

        const filters = useImageFilterStore.getState()

        // 厂区跟着历史里的机台走：否则机台已选中却不在当前厂区的列表里，
        // 用户只看到「机台 3/10」却找不到高亮的那几个
        const plants = new Set(
          item.params.machines
            .map(
              (name) =>
                settings?.machines.find((machine) => machine.name === name)
                  ?.plant,
            )
            .filter(Boolean),
        )

        if (plants.size === 1)
          filters.setPlant([...plants][0] as 'east' | 'west')

        filters.setSelectedMachines(item.params.machines)
        filters.setDate(item.params.date)
        filters.setShift(item.params.shift)
        filters.setSlots(item.params.slots)
        filters.setTypes(item.params.types)

        useCopyStore.getState().reset()
        useScanStore.getState().setTask(loaded)
        showToast(
          '已载入历史记录',
          `${item.totalImages} 张图片，可直接查看或复制`,
          'info',
        )
      } catch (cause) {
        showToast(
          '载入失败',
          toErrorMessage(cause, '载入历史记录失败'),
          'error',
        )
      }
    },
    [showToast, settings],
  )

  const status = task ? STATUS_META[task.status] : null
  const configured = Boolean(settings?.rootPath)
  const progressValue = task?.progress.percent ?? 0
  const branches = task?.branches ?? []
  const abnormal = branches.filter(
    (branch) => branch.status !== 'hit' && branch.status !== 'empty',
  )
  const eta =
    task && task.status === 'running' ? formatEta(task.progress.etaMs) : null

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">图片批量拷贝</h1>
        {status && <Badge variant={status.variant}>{status.label}</Badge>}
      </header>

      <div className="grid items-start gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <Card className="xl:sticky xl:top-6">
          <CardHeader>
            <CardTitle>扫描范围</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <ScanSetupPanel />
            <Separator />
            <ImageFilterPanel />
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
                    {progressValue}%
                  </span>
                </div>
                <Progress value={progressValue} />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="tabular-nums">
                    读取 {task?.progress.dirsScanned ?? 0} 个目录 · 跳过{' '}
                    {task?.progress.dirsSkipped ?? 0}
                  </span>
                  <span className="tabular-nums">
                    命中 {task?.totalImages ?? 0} 张
                  </span>
                </div>
                {/* 现场机器资源有限，把实际的并发档位和批次暴露出来，
                    出问题时能一眼看出是不是并发被自动降下来了 */}
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
                  {task && task.progress.detailsPending > 0 && (
                    <span className="tabular-nums">
                      待读明细 {task.progress.detailsPending}
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
              </div>

              {task?.status === 'paused' && task.pauseReason === 'network' && (
                <Alert variant="destructive">
                  <CircleAlert />
                  <AlertTitle>网络中断，任务已暂停</AlertTitle>
                  <AlertDescription>
                    恢复共享盘连接后点击「继续」，已扫描的结果不会丢失
                  </AlertDescription>
                </Alert>
              )}

              {(scanError || task?.error) && (
                <Alert variant="destructive">
                  <CircleAlert />
                  <AlertTitle>扫描失败</AlertTitle>
                  <AlertDescription>
                    {scanError ?? task?.error}
                  </AlertDescription>
                </Alert>
              )}

              {!configured && (
                <Alert>
                  <CircleAlert />
                  <AlertTitle>先配置 DC 根目录</AlertTitle>
                  <AlertDescription>
                    在左侧填写或选择根目录，应用会自动识别机台并记住这条路径
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
                    <div className="max-h-64 overflow-y-auto rounded-lg border">
                      {branches.map((branch) => (
                        <div
                          key={branch.machine}
                          className="flex items-center gap-3 border-b px-3 py-2 text-xs last:border-b-0"
                        >
                          <span className="w-24 shrink-0 font-mono">
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

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="size-4" />
                复制到本地
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CopyPanel showToast={showToast} />
            </CardContent>
          </Card>

          <HistoryPanel
            onRestore={(item) => void restoreHistory(item)}
            showToast={showToast}
            activeId={task?.id ?? null}
            activeStatus={task?.status ?? null}
            limit={historyLimit}
            onLimitChange={(limit) => void saveHistoryLimit(limit)}
          />

          {settingsError && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>配置未保存</AlertTitle>
              <AlertDescription>{settingsError}</AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    </div>
  )
}

export default ImageCopyPage
