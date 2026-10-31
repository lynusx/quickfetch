import { History, Loader2, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { useHistoryStore } from './historyStore'
import type { ScanCategory, ScanHistoryItem, ScanTaskStatus } from '@shared/ipc'
import { formatDuration } from '@/utils/common'
import { toErrorMessage } from '@/utils/error'
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

/** 历史列表只关心「什么时候扫的、扫了什么、结果多少」，时间精确到分钟就够 */
const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp)

  const pad = (value: number): string => String(value).padStart(2, '0')

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 参数摘要：机台数量 + 日期/班次 + 时段/类型数量 */
const summarize = (item: ScanHistoryItem): string => {
  const { machines, date, shift, slots, types } = item.params

  const day =
    date.length === 8
      ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`
      : date

  return `${machines.length} 台机台 · ${day} ${shift} · ${slots.length} 时段 × ${types.length} 类型`
}

interface HistoryPanelProps {
  /** 只列出这个类别的历史；三类扫描的结果互不混排 */
  category: ScanCategory
  /** 载入某次历史任务，由页面负责把快照塞进 scanStore */
  onRestore: (item: ScanHistoryItem) => void
  showToast: (
    title: string,
    message: string,
    type: 'success' | 'error' | 'info',
  ) => void
  /** 当前展示的任务 id，用于高亮 */
  activeId: string | null
  /** 当前任务状态，任务结束时触发一次静默刷新 */
  activeStatus: ScanTaskStatus | null
  /** 历史保留条数，来自配置 */
  limit: number
  onLimitChange: (limit: number) => void
}

const HistoryPanel = ({
  category,
  onRestore,
  showToast,
  activeId,
  activeStatus,
  limit,
  onLimitChange,
}: HistoryPanelProps) => {
  const {
    items,
    loading,
    refreshing,
    error,
    loadingTaskId,
    load,
    remove,
    clear,
    setLoadingTask,
  } = useHistoryStore()

  /**
   * 只留本类别、且扫到过图片的记录。
   *
   * 老版本会把取消时什么都没扫到的任务也存下来，点进去是个空列表，
   * 用户会以为功能坏了。新版本不再写这类记录，这里再兜一层，
   * 让已经存在磁盘上的旧条目也不出现在列表里。
   *
   * 中断的记录是例外：一张没扫到也要露出来 —— 至少能告诉用户
   * 「上次跑到这台机器就关掉了」，而不是让人以为程序没记住任何东西。
   */
  const visible = items.filter(
    (item) =>
      (item.totalImages > 0 || item.status === 'interrupted') &&
      item.category === category,
  )

  const [open, setOpen] = useState(false)
  const [draftLimit, setDraftLimit] = useState(String(limit))

  useEffect(() => {
    setDraftLimit(String(limit))
  }, [limit])

  useEffect(() => {
    void load()
  }, [load])

  // 任务一结束就静默刷新一次：落盘在主进程是异步的，这里稍等一下再读，
  // 避免读到的还是「落盘前」的列表
  useEffect(() => {
    if (!activeStatus) return
    if (activeStatus === 'running' || activeStatus === 'paused') return
    if (activeStatus === 'pending') return

    const timer = setTimeout(() => {
      void load(true)
    }, 400)

    return () => clearTimeout(timer)
  }, [activeStatus, activeId, load])

  const commitLimit = useCallback(() => {
    const parsed = Number.parseInt(draftLimit, 10)

    if (!Number.isFinite(parsed) || parsed === limit) {
      setDraftLimit(String(limit))
      return
    }

    onLimitChange(parsed)
  }, [draftLimit, limit, onLimitChange])

  const handleRestore = (item: ScanHistoryItem): void => {
    if (loadingTaskId) return

    setLoadingTask(item.id)

    try {
      onRestore(item)
    } finally {
      setLoadingTask(null)
    }
  }

  const handleClear = (): void => {
    clear()
      .then(() => showToast('已清空历史', '所有扫描记录均已删除', 'info'))
      .catch((cause: unknown) =>
        showToast('清空失败', toErrorMessage(cause, '清空历史失败'), 'error'),
      )
  }

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="size-4" />
            历史记录
            {refreshing && (
              <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
            )}
          </CardTitle>
          <CardAction className="flex items-center gap-2">
            <span className="text-xs tabular-nums text-muted-foreground">
              {visible.length} / {limit}
            </span>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm">
                {open ? '收起' : '展开'}
              </Button>
            </CollapsibleTrigger>
          </CardAction>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-end gap-2">
              <label
                htmlFor="history-limit"
                className="flex flex-col gap-1 text-xs"
              >
                <span className="text-muted-foreground">保留条数</span>
                <Input
                  id="history-limit"
                  className="h-8 w-20"
                  inputMode="numeric"
                  value={draftLimit}
                  onChange={(event) => setDraftLimit(event.target.value)}
                  onBlur={commitLimit}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur()
                  }}
                />
              </label>
              <p className="flex-1 pb-1 text-[11px] leading-relaxed text-muted-foreground">
                每次扫描结束后自动保存结果，含全部图片路径，可恢复查看或再次复制。
                超出条数的旧记录会被自动删除。
              </p>
              {visible.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={handleClear}
                >
                  <Trash2 data-icon="inline-start" />
                  清空
                </Button>
              )}
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}

            {loading && (
              <p className="py-4 text-center text-xs text-muted-foreground">
                正在读取历史记录…
              </p>
            )}

            {!loading && visible.length === 0 && (
              <p className="py-4 text-center text-xs text-muted-foreground">
                还没有历史记录，完成一次扫描后会自动出现在这里
              </p>
            )}

            {!loading && visible.length > 0 && (
              <div className="flex max-h-72 flex-col overflow-y-auto rounded-lg border">
                {visible.map((item) => {
                  const meta = STATUS_META[item.status]
                  const busy = loadingTaskId === item.id

                  return (
                    <div
                      key={item.id}
                      className={cn(
                        'group flex items-center gap-3 border-b px-3 py-2 text-xs last:border-b-0',
                        item.id === activeId && 'bg-muted/60',
                      )}
                    >
                      {/* 两行布局：卡片只有 500px 宽，时间和徽章占掉一半后
                          摘要只剩百来像素，单行必然截断成「2 台机台 · 2026…」 */}
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {formatTime(item.createdAt)}
                          </span>
                          <Badge variant={meta.variant} className="shrink-0">
                            {meta.label}
                          </Badge>
                        </div>
                        <button
                          type="button"
                          className="truncate text-left hover:underline"
                          title={`${item.params.machines.join('、')}\n${summarize(item)}`}
                          onClick={() => handleRestore(item)}
                        >
                          {summarize(item)}
                        </button>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-0.5 whitespace-nowrap tabular-nums text-muted-foreground">
                        <span
                          title={`命中 ${item.totalImages} 张，${item.hitMachines}/${item.machineCount} 台有结果`}
                        >
                          {item.totalImages} 张 · {item.hitMachines}/
                          {item.machineCount} 台
                        </span>
                        <span>{formatDuration(item.elapsedMs)}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                        disabled={busy}
                        onClick={() => void remove(item.id)}
                        title="删除这条记录"
                      >
                        {busy ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="size-3.5" />
                        )}
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}

export default HistoryPanel
