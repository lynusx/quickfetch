import { CounterClockwiseClockIcon, TrashIcon } from '@radix-ui/react-icons'
import { useCallback, useEffect, useState } from 'react'
import {
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Heading,
  IconButton,
  ScrollArea,
  Spinner,
  Text,
  TextField,
} from '@radix-ui/themes'

import { useHistoryStore } from './historyStore'
import type { ScanCategory, ScanHistoryItem, ScanTaskStatus } from '@shared/ipc'
import { formatDuration } from '@/utils/common'
import { toErrorMessage } from '@/utils/error'

const STATUS_META: Record<
  ScanTaskStatus,
  {
    label: string
    color: 'gray' | 'blue' | 'amber' | 'green' | 'orange' | 'red'
    variant: 'soft' | 'surface' | 'outline'
  }
> = {
  pending: { label: '待开始', color: 'gray', variant: 'surface' },
  running: { label: '进行中', color: 'blue', variant: 'soft' },
  paused: { label: '已暂停', color: 'amber', variant: 'soft' },
  completed: { label: '已完成', color: 'green', variant: 'soft' },
  canceled: { label: '已取消', color: 'gray', variant: 'outline' },
  interrupted: { label: '已中断', color: 'orange', variant: 'soft' },
  failed: { label: '失败', color: 'red', variant: 'soft' },
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
    <Card size="2">
      <Flex justify="between" align="center">
        <Flex align="center" gap="2">
          <CounterClockwiseClockIcon
            width={16}
            height={16}
            style={{ color: 'var(--accent-11)' }}
          />
          <Heading size="3">历史记录</Heading>
          {refreshing && <Spinner size="1" />}
        </Flex>
        <Flex align="center" gap="3">
          <Text
            size="1"
            color="gray"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {visible.length} / {limit}
          </Text>
          <Button
            variant="soft"
            color="gray"
            size="1"
            onClick={() => setOpen(!open)}
          >
            {open ? '收起' : '展开'}
          </Button>
        </Flex>
      </Flex>

      {open && (
        <Flex direction="column" gap="3" mt="3">
          <Flex align="end" gap="3">
            <Flex direction="column" gap="1">
              <Text as="label" size="1" color="gray">
                保留条数
              </Text>
              <TextField.Root
                size="1"
                style={{ width: 80 }}
                value={draftLimit}
                inputMode="numeric"
                onChange={(event) => setDraftLimit(event.target.value)}
                onBlur={commitLimit}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur()
                }}
              />
            </Flex>
            <Text
              size="1"
              color="gray"
              style={{ flex: 1, paddingBottom: 2, lineHeight: 1.5 }}
            >
              每次扫描结束后自动保存结果，含全部图片路径，可恢复查看或再次复制。
              超出条数的旧记录会被自动删除。
            </Text>
            {visible.length > 0 && (
              <Button variant="soft" color="red" size="1" onClick={handleClear}>
                <TrashIcon width={14} height={14} />
                清空
              </Button>
            )}
          </Flex>

          {error && (
            <Text size="1" color="red">
              {error}
            </Text>
          )}

          {loading && (
            <Box py="4">
              <Text align="center" size="1" color="gray" as="p">
                正在读取历史记录…
              </Text>
            </Box>
          )}

          {!loading && visible.length === 0 && (
            <Box py="4">
              <Text align="center" size="1" color="gray" as="p">
                还没有历史记录，完成一次扫描后会自动出现在这里
              </Text>
            </Box>
          )}

          {!loading && visible.length > 0 && (
            <Card
              size="1"
              variant="surface"
              style={{ padding: 0, overflow: 'hidden' }}
            >
              <ScrollArea
                type="auto"
                scrollbars="vertical"
                style={{ maxHeight: 280 }}
              >
                <Flex direction="column">
                  {visible.map((item, index) => {
                    const meta = STATUS_META[item.status]
                    const busy = loadingTaskId === item.id
                    const isActive = item.id === activeId

                    return (
                      <Flex
                        key={item.id}
                        align="center"
                        justify="between"
                        gap="3"
                        px="3"
                        py="2"
                        style={{
                          borderBottom:
                            index === visible.length - 1
                              ? 'none'
                              : '1px solid var(--gray-4)',
                          backgroundColor: isActive
                            ? 'var(--accent-a3)'
                            : undefined,
                          transition: 'background-color 0.15s ease',
                        }}
                      >
                        <Flex
                          direction="column"
                          gap="1"
                          style={{ minWidth: 0, flex: 1 }}
                        >
                          <Flex align="center" gap="2">
                            <Text
                              size="1"
                              color="gray"
                              style={{
                                flexShrink: 0,
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            >
                              {formatTime(item.createdAt)}
                            </Text>
                            <Badge
                              color={meta.color}
                              variant={meta.variant}
                              size="1"
                            >
                              {meta.label}
                            </Badge>
                          </Flex>
                          <button
                            type="button"
                            style={{
                              all: 'unset',
                              cursor: 'pointer',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              fontSize: 'var(--font-size-1)',
                              color: 'var(--accent-11)',
                              fontWeight: 500,
                              textAlign: 'left',
                            }}
                            title={`${item.params.machines.join('、')}\n${summarize(item)}`}
                            onClick={() => handleRestore(item)}
                          >
                            {summarize(item)}
                          </button>
                        </Flex>

                        <Flex
                          direction="column"
                          align="end"
                          gap="1"
                          style={{
                            flexShrink: 0,
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          <Text
                            size="1"
                            color="gray"
                            title={`命中 ${item.totalImages} 张，${item.hitMachines}/${item.machineCount} 台有结果`}
                          >
                            {item.totalImages} 张 · {item.hitMachines}/
                            {item.machineCount} 台
                          </Text>
                          <Text size="1" color="gray">
                            {formatDuration(item.elapsedMs)}
                          </Text>
                        </Flex>

                        <IconButton
                          variant="ghost"
                          color="gray"
                          size="1"
                          disabled={busy}
                          onClick={() => void remove(item.id)}
                          title="删除这条记录"
                        >
                          {busy ? (
                            <Spinner size="1" />
                          ) : (
                            <TrashIcon width={14} height={14} />
                          )}
                        </IconButton>
                      </Flex>
                    )
                  })}
                </Flex>
              </ScrollArea>
            </Card>
          )}
        </Flex>
      )}
    </Card>
  )
}

export default HistoryPanel
