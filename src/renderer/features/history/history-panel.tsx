import {
  CounterClockwiseClockIcon,
  InfoCircledIcon,
  TrashIcon,
} from '@radix-ui/react-icons'
import { useEffect, useState } from 'react'
import {
  Badge,
  Box,
  Button,
  Flex,
  IconButton,
  ScrollArea,
  Spinner,
  Text,
} from '@radix-ui/themes'

import { Panel, PanelBody, PanelHeader } from '@/components/panel'
import { EmptyState } from '@/components/empty-state/empty-state'
import { useSettingsStore } from '@/features/settings'
import { DEFAULT_HISTORY_LIMIT } from '@shared/historyLimit'
import { useHistoryStore } from './historyStore'
import { SCAN_STATUS_META } from '../scan/components/scanStatus'
import type { ScanCategory, ScanHistoryItem, ScanTaskStatus } from '@shared/ipc'
import { formatDuration } from '@/utils/common'
import { toErrorMessage } from '@/utils/error'
import './history.css'

/** 历史列表只关心「什么时候扫的、扫了什么、结果多少」，时间精确到分钟就够 */
const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * 参数摘要：机台数量 + 日期/班次 + 时段/类型数量（无时段类别只显示类型）。
 *
 * 森标 AOI 的局部图要单独标出来：同一天同一类型的整体/局部两次扫描，
 * 摘要长得一模一样，只能靠它区分。
 */
const summarize = (item: ScanHistoryItem): string => {
  const { machines, date, shift, slots, types } = item.params
  const day =
    date.length === 8
      ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`
      : date
  const scope = slots.length
    ? `${slots.length} 时段 × ${types.length} 类型`
    : `${types.length} 类型`

  const kind = item.params.aoiImageKind === 'partial' ? ' · 局部' : ''

  return `${machines.length} 台机台 · ${day} ${shift} · ${scope}${kind}`
}

interface HistoryPanelProps {
  /** 只列出这个类别的历史；各类扫描的结果互不混排 */
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
}

const HistoryPanel = ({
  category,
  onRestore,
  showToast,
  activeId,
  activeStatus,
}: HistoryPanelProps) => {
  const limit = useSettingsStore(
    (state) => state.settings?.historyLimit ?? DEFAULT_HISTORY_LIMIT,
  )

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
   * 只留本类别、且信息量足够的记录：
   * - 扫到过图片；
   * - 0 图但至少有一个分支真正探测过（日期/类型不存在、机台不可达等诊断结论）；
   * - 退出时中断的任务，哪怕一张没扫到也要露出来。
   *
   * 老版本会把取消时什么都没扫到的任务也存下来，点进去是个空列表。
   * 新版本不再写这类记录，这里用 diagnosed 再兜一层，旧条目也不会出现。
   */
  const visible = items.filter(
    (item) =>
      (item.totalImages > 0 ||
        item.status === 'interrupted' ||
        item.diagnosed) &&
      item.category === category,
  )

  const [open, setOpen] = useState(false)

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
    <Panel>
      <PanelHeader
        icon={<CounterClockwiseClockIcon width={13} height={13} />}
        title="历史记录"
        description="每次扫描结束后自动保存，可恢复参数或再次复制"
        actions={
          <>
            {refreshing ? <Spinner size="1" /> : null}
            <Text size="1" weight="medium" className="field-count">
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
          </>
        }
      />

      {open ? (
        <PanelBody>
          <Flex direction="column" gap="3">
            <Flex
              className="history-toolbar"
              align="center"
              gap="3"
              py="2"
              px="3"
            >
              <Text as="div" size="1" className="history-toolbar-hint">
                每条记录包含全部图片路径，可恢复查看或再次复制；保留条数在设置页调整。
              </Text>
              {visible.length > 0 ? (
                <Button
                  variant="soft"
                  color="red"
                  size="1"
                  onClick={handleClear}
                >
                  <TrashIcon width={13} height={13} />
                  清空
                </Button>
              ) : null}
            </Flex>

            {error ? (
              <Text size="1" color="red">
                {error}
              </Text>
            ) : null}

            {loading ? (
              <Flex align="center" justify="center" gap="2" py="4">
                <Spinner size="1" />
                <Text size="1" color="gray">
                  正在读取历史记录…
                </Text>
              </Flex>
            ) : null}

            {!loading && visible.length === 0 ? (
              <EmptyState
                icon={<InfoCircledIcon width={18} height={18} />}
                title="还没有历史记录"
                description="完成一次扫描后，结果会自动出现在这里，退出前中断的任务也会被保存。"
              />
            ) : null}

            {!loading && visible.length > 0 ? (
              <Box className="history-list">
                <ScrollArea
                  type="auto"
                  scrollbars="vertical"
                  className="history-scroll"
                >
                  {visible.map((item) => {
                    const meta = SCAN_STATUS_META[item.status]
                    const busy = loadingTaskId === item.id
                    const isActive = item.id === activeId

                    return (
                      <Flex
                        className="history-row"
                        key={item.id}
                        align="center"
                        gap="3"
                        py="2"
                        px="3"
                        data-active={isActive || undefined}
                      >
                        <Flex
                          direction="column"
                          gap="1"
                          flexGrow="1"
                          minWidth="0"
                        >
                          <Flex className="history-time" align="center" gap="2">
                            <Text size="1" color="gray">
                              {formatTime(item.createdAt)}
                            </Text>
                            <Badge
                              color={meta.color}
                              variant={meta.variant}
                              size="1"
                            >
                              {meta.label}
                            </Badge>
                            {item.status === 'completed' &&
                            item.totalImages === 0 ? (
                              <Badge color="amber" variant="soft" size="1">
                                未命中
                              </Badge>
                            ) : null}
                          </Flex>
                          <button
                            type="button"
                            className="history-summary"
                            title={`${item.params.machines.join('、')}\n${summarize(item)}`}
                            onClick={() => handleRestore(item)}
                          >
                            <Text size="1" weight="medium">
                              {summarize(item)}
                            </Text>
                          </button>
                        </Flex>

                        <Flex
                          direction="column"
                          align="end"
                          className="history-stats"
                        >
                          <Text as="div" size="1" color="gray">
                            {item.totalImages} 张 · {item.hitMachines}/
                            {item.machineCount} 台
                          </Text>
                          <Text as="div" size="1" color="gray">
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
                </ScrollArea>
              </Box>
            ) : null}
          </Flex>
        </PanelBody>
      ) : null}
    </Panel>
  )
}

export default HistoryPanel
