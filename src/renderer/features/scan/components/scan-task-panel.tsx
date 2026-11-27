import { animated, useTransition } from '@react-spring/web'
import {
  Info,
  Pause,
  Play,
  RefreshCw,
  Square,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import {
  Box,
  Button,
  Callout,
  Card,
  Checkbox,
  Code,
  Flex,
  Progress,
  Spinner,
  Strong,
  Table,
  Text,
  Tooltip,
} from '@radix-ui/themes'

import { StickyCopyBar, useCopyTableSelection } from '@/features/copy'
import { SPRING_SNAPPY, useReducedMotion } from '@/lib/motion'
import type { ScanCategory, ScanTask } from '@shared/ipc'

import { deriveScanTaskView, elapsedLabel } from '../scanReadModel'

const DOT_TONE: Record<string, string> = {
  success: 'success',
  danger: 'danger',
  warn: 'warn',
  muted: '',
}

const STATUS_TEXT_COLOR: Record<string, 'red' | 'amber' | 'gray'> = {
  danger: 'red',
  warn: 'amber',
  success: 'gray',
  muted: 'gray',
}

interface ScanTaskPanelProps {
  category: ScanCategory
  task: ScanTask
  creating: boolean
  busy: boolean
  canStart: boolean
  error?: string | null
  other?: ScanTask | null
  otherLabel?: string | null
  networkHint: string
  showToast: (
    title: string,
    message: string,
    type: 'success' | 'error' | 'info',
  ) => void
  onStart: () => void
  onPause: () => void
  onResume: () => void
  onCancel: () => void
  onClear: () => void
}

const AnimatedTableRow = animated(Table.Row)

/**
 * 扫描与就地复制统一单列任务流（Single-Column Task Stream）。
 *
 * 本模块负责扫描主控条、异常提示与随页自然滚动的渐进机台结果表；
 * 复制勾选与吸底复制栏统一经 `features/copy` 的窄接口协作，不直接读写 `copyStore`。
 */
export const ScanTaskPanel = ({
  category,
  task,
  creating,
  busy,
  canStart,
  error,
  other,
  otherLabel,
  networkHint,
  showToast,
  onStart,
  onPause,
  onResume,
  onCancel,
  onClear,
}: ScanTaskPanelProps) => {
  const view = deriveScanTaskView(task)
  const {
    machines,
    selectableMachines,
    allSelectableChecked,
    someSelectableChecked,
    locked: copyLocked,
    toggleAll,
    toggleMachine,
  } = useCopyTableSelection(category, task)

  const selectableSet = new Set(selectableMachines)
  const reducedMotion = useReducedMotion()

  const rowTransitions = useTransition(view.rows, {
    keys: (row) => `${task.id}:${row.machine}`,
    from: { opacity: 0, y: 8 },
    enter: { opacity: 1, y: 0 },
    config: SPRING_SNAPPY,
    immediate: reducedMotion,
  })

  const metricsSummary = (
    <Flex align="center" gap="3" wrap="wrap" className="tabular">
      <Text size="2" color="gray">
        命中{' '}
        <Text size="2" weight="bold" highContrast>
          {task.totalImages.toLocaleString()} 张
        </Text>
      </Text>
      <Text size="2" color="gray">
        耗时 {elapsedLabel(task)}
      </Text>
      {task.progress.dirsScanned > 0 ? (
        <Text size="2" color="gray">
          目录 {task.progress.dirsScanned.toLocaleString()}
        </Text>
      ) : null}
    </Flex>
  )

  const progressHeadline =
    task.status === 'paused'
      ? '扫描已暂停'
      : [
          view.phaseDescription || '正在扫描…',
          view.machinesPending > 0 ? `等待 ${view.machinesPending} 台` : null,
          view.etaText ? `剩余 ${view.etaText}` : null,
        ]
          .filter(Boolean)
          .join(' · ')

  return (
    <Flex direction="column" gap="4">
      <Card size="2" className="app-card">
        <Flex direction="column" gap="4" p="4">
          {busy ? (
            <Flex direction="column" gap="2">
              <Flex align="center" justify="between" gap="3">
                <Flex align="center" gap="2" minWidth="0">
                  {task.status !== 'paused' ? <Spinner size="1" /> : null}
                  <Text size="2" weight="medium" truncate>
                    {progressHeadline}
                  </Text>
                </Flex>
                <Text size="2" weight="bold" className="tabular">
                  {task.progress.percent}%
                </Text>
              </Flex>

              <Progress value={task.progress.percent} />

              <Flex align="center" justify="between" gap="3" wrap="wrap">
                {metricsSummary}
                <Flex align="center" gap="2">
                  {task.status === 'paused' ? (
                    <Button size="1" variant="soft" onClick={onResume}>
                      <Play size={13} strokeWidth={1.75} /> 继续
                    </Button>
                  ) : (
                    <Button
                      size="1"
                      variant="soft"
                      onClick={onPause}
                      disabled={task.status !== 'running'}
                    >
                      <Pause size={13} strokeWidth={1.75} /> 暂停
                    </Button>
                  )}
                  <Button
                    size="1"
                    variant="outline"
                    color="red"
                    onClick={onCancel}
                  >
                    <Square size={13} strokeWidth={1.75} /> 取消
                  </Button>
                </Flex>
              </Flex>
            </Flex>
          ) : (
            <Flex align="center" justify="between" gap="3" wrap="wrap">
              {metricsSummary}
              <Flex align="center" gap="2">
                <Button size="1" onClick={onStart} disabled={!canStart}>
                  {creating ? (
                    <Spinner size="1" />
                  ) : (
                    <RefreshCw size={13} strokeWidth={1.75} />
                  )}
                  重新扫描
                </Button>
                <Button
                  size="1"
                  variant="soft"
                  color="gray"
                  onClick={onClear}
                  aria-label="清除扫描结果"
                >
                  <Trash2 size={13} strokeWidth={1.75} /> 清除
                </Button>
              </Flex>
            </Flex>
          )}

          {(other ||
            (error ?? task.error) ||
            (task.status === 'completed' && task.totalImages === 0) ||
            (task.status === 'paused' && task.pauseReason === 'network')) && (
            <Flex direction="column" gap="2">
              {other && otherLabel ? (
                <Callout.Root color="blue" size="1">
                  <Callout.Icon>
                    <TriangleAlert size={14} strokeWidth={1.75} />
                  </Callout.Icon>
                  <Callout.Text>
                    <Strong>另一类扫描正在进行：</Strong> {otherLabel}
                  </Callout.Text>
                </Callout.Root>
              ) : null}

              {task.status === 'completed' && task.totalImages === 0 ? (
                <Callout.Root color="amber" size="1">
                  <Callout.Icon>
                    <Info size={14} strokeWidth={1.75} />
                  </Callout.Icon>
                  <Callout.Text>
                    <Strong>没有命中图片：</Strong>
                    请检查机台、日期、班次与类型；下方各机台保留了断链原因。
                  </Callout.Text>
                </Callout.Root>
              ) : null}

              {task.status === 'paused' && task.pauseReason === 'network' ? (
                <Callout.Root color="red" size="1">
                  <Callout.Icon>
                    <TriangleAlert size={14} strokeWidth={1.75} />
                  </Callout.Icon>
                  <Callout.Text>
                    <Strong>网络不通，任务已暂停：</Strong> {networkHint}
                  </Callout.Text>
                </Callout.Root>
              ) : null}

              {(error ?? task.error) ? (
                <Callout.Root color="red" size="1">
                  <Callout.Icon>
                    <TriangleAlert size={14} strokeWidth={1.75} />
                  </Callout.Icon>
                  <Callout.Text>
                    <Strong>扫描失败：</Strong> {error ?? task.error}
                  </Callout.Text>
                </Callout.Root>
              ) : null}
            </Flex>
          )}

          {task.status !== 'pending' && view.rows.length > 0 ? (
            <Table.Root variant="surface" layout="fixed">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeaderCell width="40px">
                    <Checkbox
                      checked={
                        allSelectableChecked
                          ? true
                          : someSelectableChecked
                            ? 'indeterminate'
                            : false
                      }
                      disabled={copyLocked || selectableMachines.length === 0}
                      onCheckedChange={toggleAll}
                      aria-label="全选或取消已命中的机台"
                      title="全选/取消已命中的机台"
                    />
                  </Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>机台</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>状态</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell justify="end">
                    数量
                  </Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell justify="end">
                    大小
                  </Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell justify="end">
                    用时
                  </Table.ColumnHeaderCell>
                </Table.Row>
              </Table.Header>

              <Table.Body>
                {rowTransitions((spring, row) => {
                  const hasImages = selectableSet.has(row.machine)
                  const isChecked = machines.includes(row.machine)
                  const statusContent = (
                    <Flex align="center" gap="2" minWidth="0">
                      {row.scanning ? (
                        <Spinner size="1" />
                      ) : (
                        <Box
                          as="span"
                          className="status-dot"
                          data-tone={DOT_TONE[row.tone] || undefined}
                        />
                      )}
                      <Text
                        size="2"
                        color={
                          row.scanning
                            ? 'gray'
                            : (STATUS_TEXT_COLOR[row.tone] ?? 'gray')
                        }
                        truncate
                      >
                        {row.statusText}
                      </Text>
                    </Flex>
                  )

                  return (
                    <AnimatedTableRow
                      key={row.machine}
                      align="center"
                      style={{
                        opacity: spring.opacity,
                        transform: spring.y.to((v) => `translateY(${v}px)`),
                      }}
                    >
                      <Table.Cell>
                        <Checkbox
                          checked={isChecked}
                          disabled={!hasImages || copyLocked}
                          aria-label={`选择机台 ${row.machine}`}
                          onCheckedChange={(checked) =>
                            toggleMachine(row.machine, checked)
                          }
                        />
                      </Table.Cell>
                      <Table.RowHeaderCell>
                        <Code variant="ghost" size="2" highContrast>
                          {row.machine}
                        </Code>
                      </Table.RowHeaderCell>
                      <Table.Cell>
                        {row.detail ? (
                          <Tooltip content={row.detail}>
                            {statusContent}
                          </Tooltip>
                        ) : (
                          statusContent
                        )}
                      </Table.Cell>
                      <Table.Cell justify="end">
                        <Text
                          size="2"
                          weight="medium"
                          className="tabular"
                          color={hasImages ? undefined : 'gray'}
                        >
                          {row.imagesText}
                        </Text>
                      </Table.Cell>
                      <Table.Cell justify="end">
                        <Text size="2" color="gray" className="tabular">
                          {row.sizeText}
                        </Text>
                      </Table.Cell>
                      <Table.Cell justify="end">
                        <Text size="2" color="gray" className="tabular">
                          {row.elapsedText}
                        </Text>
                      </Table.Cell>
                    </AnimatedTableRow>
                  )
                })}
              </Table.Body>
            </Table.Root>
          ) : null}
        </Flex>
      </Card>

      <StickyCopyBar
        category={category}
        visible={task.totalImages > 0}
        showToast={showToast}
      />
    </Flex>
  )
}

export default ScanTaskPanel
