import { History, Info, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  AlertDialog,
  Badge,
  Box,
  Button,
  Flex,
  IconButton,
  Link,
  ScrollArea,
  Spinner,
  Text,
} from '@radix-ui/themes'

import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/drawer'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/empty'
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

/**
 * 扫描历史入口（标题栏按钮 + 右侧 Drawer 抽屉）。
 *
 * 四类扫描页均在 Page Header Actions 挂此组件，点击滑出右侧抽屉查看并一键恢复；
 * 清空全部走 AlertDialog 二次确认。
 */
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

  const visible = items.filter(
    (item) =>
      (item.totalImages > 0 ||
        item.status === 'interrupted' ||
        item.diagnosed) &&
      item.category === category,
  )

  const [open, setOpen] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

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
      setOpen(false)
    } finally {
      setLoadingTask(null)
    }
  }

  const handleClear = (): void => {
    setConfirmClear(false)
    clear()
      .then(() => showToast('已清空历史', '所有扫描记录均已删除', 'info'))
      .catch((cause: unknown) =>
        showToast('清空失败', toErrorMessage(cause, '清空历史失败'), 'error'),
      )
  }

  return (
    <>
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger>
          <Button type="button" variant="soft" color="gray" size="2">
            {refreshing ? (
              <Spinner size="1" />
            ) : (
              <History size={14} strokeWidth={1.75} />
            )}
            历史
            {visible.length > 0 ? (
              <Text size="1" color="gray" className="tabular">
                {visible.length}
              </Text>
            ) : null}
          </Button>
        </DrawerTrigger>

        <DrawerContent side="right" width="480px">
          <DrawerHeader>
            <Flex align="center" gap="2">
              <DrawerTitle>扫描历史</DrawerTitle>
              <Text size="1" weight="medium" color="gray" className="tabular">
                {visible.length} / {limit}
              </Text>
            </Flex>
            <DrawerDescription>
              点击记录可回填参数并恢复完整图片清单；保留条数在设置页调整。
            </DrawerDescription>
          </DrawerHeader>

          <DrawerBody>
            {error ? (
              <Text size="1" color="red" mb="3">
                {error}
              </Text>
            ) : null}

            {loading ? (
              <Flex align="center" justify="center" gap="2" py="5">
                <Spinner size="1" />
                <Text size="1" color="gray">
                  正在读取历史记录…
                </Text>
              </Flex>
            ) : null}

            {!loading && visible.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Info size={18} strokeWidth={1.75} />
                  </EmptyMedia>
                  <EmptyTitle>还没有历史记录</EmptyTitle>
                  <EmptyDescription>
                    完成一次扫描后，结果会自动出现在这里，退出前中断的任务也会被保存。
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : null}

            {!loading && visible.length > 0 ? (
              <Box
                className="history-list"
                flexGrow="1"
                minHeight="0"
                overflow="hidden"
              >
                <ScrollArea type="auto" size="1" scrollbars="vertical">
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
                          <Flex className="tabular" align="center" gap="2">
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
                              <Badge color="amber">未命中</Badge>
                            ) : null}
                          </Flex>
                          <Link
                            asChild
                            size="1"
                            weight="medium"
                            underline="hover"
                            truncate
                            title={`${item.params.machines.join('、')}\n${summarize(item)}`}
                          >
                            <button
                              type="button"
                              className="history-summary"
                              onClick={() => handleRestore(item)}
                            >
                              {summarize(item)}
                            </button>
                          </Link>
                        </Flex>

                        <Box flexShrink="0">
                          <Flex
                            direction="column"
                            align="end"
                            className="tabular"
                          >
                            <Text as="div" size="1" color="gray" align="right">
                              {item.totalImages} 张 · {item.hitMachines}/
                              {item.machineCount} 台
                            </Text>
                            <Text as="div" size="1" color="gray" align="right">
                              {formatDuration(item.elapsedMs)}
                            </Text>
                          </Flex>
                        </Box>

                        <IconButton
                          variant="ghost"
                          color="gray"
                          size="1"
                          disabled={busy}
                          onClick={() => void remove(item.id)}
                          aria-label="删除这条记录"
                          title="删除这条记录"
                        >
                          {busy ? (
                            <Spinner size="1" />
                          ) : (
                            <Trash2 size={14} strokeWidth={1.75} />
                          )}
                        </IconButton>
                      </Flex>
                    )
                  })}
                </ScrollArea>
              </Box>
            ) : null}
          </DrawerBody>

          <DrawerFooter>
            {visible.length > 0 ? (
              <Button
                type="button"
                variant="soft"
                color="red"
                size="2"
                onClick={() => setConfirmClear(true)}
              >
                <Trash2 size={14} strokeWidth={1.75} />
                清空全部
              </Button>
            ) : (
              <Box />
            )}

            <DrawerClose>
              <Button type="button" variant="soft" color="gray" size="2">
                关闭
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <AlertDialog.Root open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialog.Content maxWidth="400px">
          <AlertDialog.Title>清空全部扫描历史？</AlertDialog.Title>
          <AlertDialog.Description size="2">
            将删除所有已保存的扫描记录，此操作无法撤销。
          </AlertDialog.Description>
          <Flex gap="3" justify="end" mt="4">
            <AlertDialog.Cancel>
              <Button variant="soft" color="gray">
                取消
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
              <Button color="red" onClick={handleClear}>
                确认清空
              </Button>
            </AlertDialog.Action>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </>
  )
}

export default HistoryPanel
