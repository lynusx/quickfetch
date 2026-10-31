import { useCallback, type ReactNode } from 'react'
import {
  DownloadIcon,
  ExclamationTriangleIcon,
  MagicWandIcon,
  PauseIcon,
  PlayIcon,
  StopIcon,
} from '@radix-ui/react-icons'
import {
  Badge,
  Button,
  Callout,
  Card,
  Flex,
  Grid,
  Heading,
  Progress,
  ScrollArea,
  Separator,
  Spinner,
  Strong,
  Text,
} from '@radix-ui/themes'

import { CopyPanel } from '@/features/copy'
import { HistoryPanel } from '@/features/history'
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

const STATUS_META: Record<
  ScanTaskStatus,
  {
    label: string
    color: 'blue' | 'gray' | 'green' | 'red' | 'amber'
    variant: 'solid' | 'soft' | 'outline' | 'surface'
  }
> = {
  pending: { label: '待开始', color: 'gray', variant: 'outline' },
  running: { label: '进行中', color: 'blue', variant: 'soft' },
  paused: { label: '已暂停', color: 'amber', variant: 'outline' },
  completed: { label: '已完成', color: 'green', variant: 'soft' },
  canceled: { label: '已取消', color: 'gray', variant: 'outline' },
  interrupted: { label: '已中断', color: 'amber', variant: 'outline' },
  failed: { label: '失败', color: 'red', variant: 'soft' },
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
  title: string
  unconfigured: { title: string; description: string }
  networkHint: string
  configured: boolean
  activeMachines: number
  ready: boolean
  missing?: string[]
  getParams: () => Omit<ScanTaskParams, 'category'>
  picker: ReactNode
  filterPanel: ReactNode
}

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
  const unreachable = branches.filter(
    (branch) => branch.unreachableReason === 'network',
  ).length
  const eta =
    task && task.status === 'running' ? formatEta(task.progress.etaMs) : null

  const clearResult = useCallback(() => {
    store.getState().setTask(null)
  }, [store])

  return (
    <Flex direction="column" gap="5">
      <Flex align="center" gap="3">
        <Heading size="6">{title}</Heading>
        {status && (
          <Badge color={status.color} variant={status.variant}>
            {status.label}
          </Badge>
        )}
      </Flex>

      <Grid columns={{ initial: '1', xl: '380px 1fr' }} gap="5" align="start">
        <Card size="2">
          <Heading size="3" mb="3">
            扫描范围
          </Heading>
          <Flex direction="column" gap="4">
            {picker}
            <Separator size="4" />
            {filterPanel}
          </Flex>
        </Card>

        <Flex direction="column" gap="5">
          <Card size="2">
            <Heading size="3">扫描进度</Heading>
            <Text size="1" color="gray" mb="3">
              {task
                ? task.status === 'interrupted'
                  ? '上次退出时保存，点「开始扫描」可按原参数重扫'
                  : task.progress.phase === 'done'
                    ? STATUS_META[task.status].label
                    : PHASE_LABEL[task.progress.phase]
                : '尚未开始扫描'}
            </Text>

            <Flex direction="column" gap="4">
              <Flex direction="column" gap="2">
                <Flex justify="between" align="baseline">
                  <Text size="2" color="gray">
                    完成进度
                  </Text>
                  <Text
                    size="2"
                    color="gray"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {task?.progress.percent ?? 0}%
                  </Text>
                </Flex>
                <Progress value={task?.progress.percent ?? 0} />
                <Flex justify="between" align="center">
                  <Text
                    size="1"
                    color="gray"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    读取 {task?.progress.dirsScanned ?? 0} 个目录 · 跳过{' '}
                    {task?.progress.dirsSkipped ?? 0}
                    {unreachable > 0 && ` · 不可达 ${unreachable} 台`}
                  </Text>
                  <Text
                    size="1"
                    color="gray"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    命中 {task?.totalImages ?? 0} 张
                  </Text>
                </Flex>
                <Flex wrap="wrap" gap="3">
                  {task && task.progress.batchTotal > 0 && (
                    <Text
                      size="1"
                      color="gray"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      第 {task.progress.batchIndex}/{task.progress.batchTotal}{' '}
                      批
                    </Text>
                  )}
                  {task && task.progress.concurrency > 0 && (
                    <Text
                      size="1"
                      color="gray"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      并发 {task.progress.concurrency}
                    </Text>
                  )}
                  {eta && (
                    <Text
                      size="1"
                      color="gray"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      剩余 {eta}
                    </Text>
                  )}
                </Flex>
                {task?.progress.currentPath && (
                  <Text
                    size="1"
                    color="gray"
                    truncate
                    style={{ fontFamily: 'var(--code-font-family)' }}
                    title={task.progress.currentPath}
                  >
                    {task.progress.currentPath}
                  </Text>
                )}
              </Flex>

              <Flex wrap="wrap" align="center" gap="2">
                {!busy ? (
                  <Button
                    size="2"
                    variant="solid"
                    onClick={() => void start()}
                    disabled={!canStart}
                  >
                    {creating ? (
                      <Spinner size="1" />
                    ) : (
                      <MagicWandIcon width={16} height={16} />
                    )}
                    {task ? '重新扫描' : '开始扫描'}
                  </Button>
                ) : (
                  <>
                    {task?.status === 'paused' ? (
                      <Button size="2" onClick={() => void resume()}>
                        <PlayIcon width={16} height={16} />
                        继续
                      </Button>
                    ) : (
                      <Button
                        size="2"
                        variant="outline"
                        onClick={() => void pause()}
                        disabled={task?.status !== 'running'}
                      >
                        <PauseIcon width={16} height={16} />
                        暂停
                      </Button>
                    )}
                    <Button
                      size="2"
                      variant="outline"
                      onClick={() => void cancel()}
                    >
                      <StopIcon width={16} height={16} />
                      取消
                    </Button>
                  </>
                )}
                {task && !busy && (
                  <Button size="2" variant="ghost" onClick={clearResult}>
                    清除结果
                  </Button>
                )}
              </Flex>

              {!ready && !busy && missing?.length ? (
                <Text size="1" color="gray">
                  还需要选择{missing.join('、')}，选齐后才能开始扫描
                </Text>
              ) : null}

              {other && otherLabel && (
                <Callout.Root color="blue" size="1">
                  <Callout.Icon>
                    <ExclamationTriangleIcon width={14} height={14} />
                  </Callout.Icon>
                  <Callout.Text>
                    <Strong>另一类扫描正在进行：</Strong> {otherLabel}
                  </Callout.Text>
                </Callout.Root>
              )}

              {!configured && (
                <Callout.Root color="amber" size="1">
                  <Callout.Icon>
                    <ExclamationTriangleIcon width={14} height={14} />
                  </Callout.Icon>
                  <Callout.Text>
                    <Strong>{unconfigured.title}：</Strong>{' '}
                    {unconfigured.description}
                  </Callout.Text>
                </Callout.Root>
              )}

              {configured && !activeMachines && (
                <Callout.Root color="amber" size="1">
                  <Callout.Icon>
                    <ExclamationTriangleIcon width={14} height={14} />
                  </Callout.Icon>
                  <Callout.Text>
                    <Strong>入口里没有可用机台：</Strong>
                    请确认快捷方式的目标是网络路径（\\主机），本地路径会被跳过
                  </Callout.Text>
                </Callout.Root>
              )}

              {task?.status === 'paused' && task.pauseReason === 'network' && (
                <Callout.Root color="red" size="1">
                  <Callout.Icon>
                    <ExclamationTriangleIcon width={14} height={14} />
                  </Callout.Icon>
                  <Callout.Text>
                    <Strong>机台不可达，任务已暂停：</Strong> {networkHint}
                  </Callout.Text>
                </Callout.Root>
              )}

              {(scanError || error || task?.error) && (
                <Callout.Root color="red" size="1">
                  <Callout.Icon>
                    <ExclamationTriangleIcon width={14} height={14} />
                  </Callout.Icon>
                  <Callout.Text>
                    <Strong>扫描失败：</Strong>{' '}
                    {scanError ?? error ?? task?.error}
                  </Callout.Text>
                </Callout.Root>
              )}

              {task && task.status !== 'pending' && (
                <>
                  <Separator size="4" />
                  <Flex direction="column" gap="2">
                    <Flex justify="between" align="center">
                      <Text size="2" weight="medium">
                        各机台结果
                      </Text>
                      <Text
                        size="1"
                        color="gray"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        {formatDuration(task.elapsedMs)}
                        {abnormal.length > 0 &&
                          ` · ${abnormal.length} 台无结果`}
                      </Text>
                    </Flex>
                    <ScrollArea
                      scrollbars="vertical"
                      style={{
                        maxHeight: 320,
                        border: '1px solid var(--gray-6)',
                        borderRadius: 'var(--radius-3)',
                      }}
                    >
                      {branches.map((branch) => (
                        <Flex
                          key={branch.machine}
                          align="center"
                          justify="between"
                          gap="3"
                          px="3"
                          py="2"
                          style={{
                            borderBottom: '1px solid var(--gray-4)',
                            fontSize: '12px',
                          }}
                        >
                          <Text
                            size="1"
                            style={{
                              width: 110,
                              fontFamily: 'var(--code-font-family)',
                            }}
                          >
                            {branch.machine}
                          </Text>
                          <Text
                            size="1"
                            color={
                              branch.status === 'hit'
                                ? 'gray'
                                : branch.unreachableReason === 'network'
                                  ? 'red'
                                  : 'gray'
                            }
                            weight={
                              branch.unreachableReason === 'network'
                                ? 'bold'
                                : 'regular'
                            }
                            truncate
                            style={{ flex: 1 }}
                            title={branchText(branch)}
                          >
                            {branchText(branch)}
                          </Text>
                          <Text
                            size="1"
                            weight={
                              branch.status === 'hit' ? 'bold' : 'regular'
                            }
                            color={branch.status === 'hit' ? undefined : 'gray'}
                            style={{ fontVariantNumeric: 'tabular-nums' }}
                          >
                            {branch.images > 0 ? `${branch.images} 张` : '—'}
                          </Text>
                        </Flex>
                      ))}
                    </ScrollArea>
                  </Flex>
                </>
              )}
            </Flex>
          </Card>

          <Card size="2">
            <Heading
              size="3"
              mb="3"
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <DownloadIcon width={16} height={16} />
              复制到本地
            </Heading>
            <CopyPanel category={category} showToast={showToast} />
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
        </Flex>
      </Grid>
    </Flex>
  )
}

export default PlantScanPage
