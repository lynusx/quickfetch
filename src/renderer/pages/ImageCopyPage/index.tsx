import {
  CircleAlert,
  Download,
  Loader2,
  Pause,
  Play,
  Square,
  Wand2,
} from 'lucide-react'

import ImageFilterPanel from '@/components/ImageFilterPanel'
import ScanSetupPanel from '@/components/ScanSetupPanel'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { useImageCopy } from '@/hooks/useImageCopy'
import { useScanTask } from '@/hooks/useScanTask'
import { useToast } from '@/hooks/useToast'
import { useScanStore } from '@/stores/scanStore'
import { useSettingsStore } from '@/stores/settingsStore'
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

const ImageCopyPage = () => {
  const { showToast } = useToast()
  const { task, creating, busy, canStart, start, pause, resume, cancel } =
    useScanTask({ showToast })
  const { handleCopy, canCopy, percent, copy } = useImageCopy({ showToast })

  const settingsError = useSettingsStore((state) => state.error)
  const settings = useSettingsStore((state) => state.settings)
  const scanError = useScanStore((state) => state.error)

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
                  onClick={() => void handleCopy()}
                  disabled={!canCopy}
                >
                  <Download data-icon="inline-start" />
                  复制到目标目录
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

              {copy && (
                <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">
                      {copy.running ? '复制中' : '复制完成'}
                      {copy.batchTotal > 1 && (
                        <span className="ml-2 font-normal text-muted-foreground">
                          第 {copy.batchIndex}/{copy.batchTotal} 批
                        </span>
                      )}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {copy.copied} / {copy.total} 张
                      {copy.failed > 0 && ` · 失败 ${copy.failed}`}
                    </span>
                  </div>
                  <Progress value={percent} />
                </div>
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
