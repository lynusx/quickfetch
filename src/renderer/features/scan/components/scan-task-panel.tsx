import { useState } from 'react'
import { Link } from 'react-router'
import {
  CircleCheck,
  Download,
  ExternalLink,
  Info,
  Pause,
  Play,
  RotateCcw,
  Square,
  TriangleAlert,
} from 'lucide-react'
import {
  AlertDialog,
  Box,
  Button,
  Callout,
  Card,
  Checkbox,
  Code,
  DataList,
  Flex,
  Progress,
  ScrollArea,
  Spinner,
  Strong,
  Table,
  Text,
  TextField,
  Tooltip,
} from '@radix-ui/themes'

import { useImageCopy } from '@/features/copy/useImageCopy'
import { copyStoreOf } from '@/features/copy/copyStore'
import { previewSizeLabel } from '@/features/copy/copyReadModel'
import { selectPreferences, useSettingsStore } from '@/features/settings'
import { ROUTES } from '@/routes/paths'
import type { ScanCategory, ScanTask } from '@shared/ipc'
import { COPY_CONFLICT_LABEL, COPY_LAYOUT_LABEL } from '@shared/ipc'
import { elapsedLabel, deriveScanTaskView } from '../scanReadModel'
import { formatFileSize } from '@/utils/common'
import { ScanStatusBadge } from './scan-status-badge'

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

/**
 * 扫描与就地复制统一单列任务流（Single-Column Task Stream）。
 *
 * 1. 上半部卡片：主控条 + 结构化指标 + 扫描进度 + 随页自然滚动的机台结果表（支持就地勾选）；
 * 2. 下半部吸底栏：命中图片后以 sticky 卡片固定在视口底部，承载目标目录、复制触发/进度、
 *    部分失败计数与重试明细，以及 AlertDialog 重名覆盖确认。
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

  const copyStore = copyStoreOf(category)
  const {
    machineStats,
    preview,
    previewing,
    readModel,
    busy: copyBusy,
    error: copyError,
    canCopy,
    handleStart,
    handlePause: handleCopyPause,
    handleResume: handleCopyResume,
    handleCancel: handleCopyCancel,
    handleRetry,
    handleReveal,
    handlePickTarget,
  } = useImageCopy({ category, showToast })

  const machines = copyStore((state) => state.machines)
  const setMachines = copyStore((state) => state.setMachines)
  const copyTask = copyStore((state) => state.task)
  const showFailures = copyStore((state) => state.showFailures)
  const setShowFailures = copyStore((state) => state.setShowFailures)

  const preferences = useSettingsStore(selectPreferences)
  const layout = preferences.copyLayout
  const conflict = preferences.copyConflict

  const [confirmOverwrite, setConfirmOverwrite] = useState(false)

  const {
    selectedCount,
    pickedCount,
    running: copyRunning,
    paused: copyPaused,
    finished: copyFinished,
    activeDir,
    done: copyDone,
    percent: copyPercent,
  } = readModel

  const sizeLabel = previewSizeLabel(preview, previewing)

  const onStartCopyClick = () => {
    if (conflict === 'overwrite' && preview && preview.conflicts > 0) {
      setConfirmOverwrite(true)
      return
    }
    void handleStart()
  }

  // 结果行中真正有图片的机台，才能被勾选用于复制
  const imageCountMap = new Map(
    machineStats.map((item) => [item.machine, item.images]),
  )
  const selectableRows = view.rows.filter(
    (r) => (imageCountMap.get(r.machine) ?? 0) > 0,
  )
  const allSelectableChecked =
    selectableRows.length > 0 &&
    selectableRows.every((r) => machines.includes(r.machine))
  const someSelectableChecked = selectableRows.some((r) =>
    machines.includes(r.machine),
  )

  const toggleAll = (checked: boolean | 'indeterminate') => {
    if (checked) {
      setMachines(selectableRows.map((r) => r.machine))
    } else {
      setMachines([])
    }
  }

  const toggleRow = (machine: string, checked: boolean | 'indeterminate') => {
    if (checked) {
      setMachines([...new Set([...machines, machine])])
    } else {
      setMachines(machines.filter((m) => m !== machine))
    }
  }

  const failedCount = copyTask?.progress.failed ?? 0
  const hasCopyFailures = copyFinished && failedCount > 0
  const copySucceededClean =
    copyFinished && copyTask?.status === 'completed' && failedCount === 0

  return (
    <Flex direction="column" gap="4">
      <Card size="2" className="app-card">
        <Flex direction="column" gap="4" p="4">
          {/* 1. 顶层状态与主控条 */}
          <Flex align="center" justify="between" gap="3" wrap="wrap">
            <Flex align="center" gap="2">
              {!busy ? (
                <Button size="2" onClick={onStart} disabled={!canStart}>
                  {creating ? (
                    <Spinner size="1" />
                  ) : (
                    <Play size={14} strokeWidth={1.75} />
                  )}
                  重新扫描
                </Button>
              ) : (
                <>
                  {task.status === 'paused' ? (
                    <Button size="2" onClick={onResume}>
                      <Play size={14} strokeWidth={1.75} /> 继续
                    </Button>
                  ) : (
                    <Button
                      size="2"
                      variant="outline"
                      onClick={onPause}
                      disabled={task.status !== 'running'}
                    >
                      <Pause size={14} strokeWidth={1.75} /> 暂停
                    </Button>
                  )}
                  <Button size="2" variant="outline" onClick={onCancel}>
                    <Square size={14} strokeWidth={1.75} /> 取消
                  </Button>
                </>
              )}

              {!busy ? (
                <Button
                  size="2"
                  variant="ghost"
                  color="gray"
                  onClick={onClear}
                  aria-label="清除扫描结果"
                  title="清除扫描结果"
                >
                  <RotateCcw size={14} strokeWidth={1.75} />
                </Button>
              ) : null}

              <ScanStatusBadge status={task.status} size="1" />
            </Flex>

            {/* 结构化关键指标 */}
            <DataList.Root orientation="horizontal">
              <DataList.Item align="center">
                <DataList.Label minWidth="auto">命中</DataList.Label>
                <DataList.Value>
                  <Text size="2" weight="bold" className="tabular">
                    {task.totalImages.toLocaleString()} 张
                  </Text>
                </DataList.Value>
              </DataList.Item>
              <DataList.Item align="center">
                <DataList.Label minWidth="auto">耗时</DataList.Label>
                <DataList.Value>
                  <Text size="2" color="gray" className="tabular">
                    {elapsedLabel(task)}
                  </Text>
                </DataList.Value>
              </DataList.Item>
              {task.progress.dirsScanned > 0 ? (
                <DataList.Item align="center">
                  <DataList.Label minWidth="auto">目录</DataList.Label>
                  <DataList.Value>
                    <Text size="2" color="gray" className="tabular">
                      {task.progress.dirsScanned}
                    </Text>
                  </DataList.Value>
                </DataList.Item>
              ) : null}
            </DataList.Root>
          </Flex>

          {/* 扫描进度 */}
          {busy || task.progress.percent > 0 ? (
            <Box>
              <Progress value={task.progress.percent} size="2" />
              <Flex justify="between" align="center" mt="1" className="tabular">
                <Text size="2" color="gray">
                  {view.phaseDescription || `${task.progress.percent}%`}
                  {view.machinesPending > 0 &&
                    ` · 等待 ${view.machinesPending} 台`}
                  {view.etaText && ` · 剩余 ${view.etaText}`}
                </Text>
                <Text size="2" weight="medium" color="gray">
                  {task.progress.percent}%
                </Text>
              </Flex>
            </Box>
          ) : null}

          {/* 异常与阻断通知 */}
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

          {/* 2. 随页自然滚动的机台结果与就地勾选表 */}
          {task.status !== 'pending' && view.rows.length > 0 ? (
            <Table.Root variant="surface">
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
                      disabled={
                        copyRunning || copyPaused || selectableRows.length === 0
                      }
                      onCheckedChange={toggleAll}
                      aria-label="全选或取消已命中的机台"
                      title="全选/取消已命中的机台"
                    />
                  </Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>机台</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>状态</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell align="right">
                    图片
                  </Table.ColumnHeaderCell>
                </Table.Row>
              </Table.Header>

              <Table.Body>
                {view.rows.map((row) => {
                  const hasImages = (imageCountMap.get(row.machine) ?? 0) > 0
                  const isChecked = machines.includes(row.machine)
                  const statusContent = (
                    <Flex align="center" gap="2" minWidth="0">
                      <Box
                        as="span"
                        className="status-dot"
                        data-tone={DOT_TONE[row.tone] || undefined}
                      />
                      <Text
                        size="2"
                        color={STATUS_TEXT_COLOR[row.tone] ?? 'gray'}
                        truncate
                      >
                        {row.statusText}
                      </Text>
                    </Flex>
                  )

                  return (
                    <Table.Row key={row.machine} align="center">
                      <Table.Cell>
                        <Checkbox
                          checked={isChecked}
                          disabled={!hasImages || copyRunning || copyPaused}
                          aria-label={`选择机台 ${row.machine}`}
                          onCheckedChange={(checked) =>
                            toggleRow(row.machine, checked)
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
                      <Table.Cell align="right">
                        <Text
                          size="2"
                          weight="medium"
                          className="tabular"
                          color={hasImages ? undefined : 'gray'}
                        >
                          {row.imagesText}
                        </Text>
                      </Table.Cell>
                    </Table.Row>
                  )
                })}
              </Table.Body>
            </Table.Root>
          ) : null}
        </Flex>
      </Card>

      {/* 3. 吸底复制操作栏（置于 Card 外部，避免 Card overflow:hidden 破坏 sticky） */}
      {task.totalImages > 0 ? (
        <Box position="sticky" bottom="3" className="sticky-copy-bar">
          <Card size="2" className="app-card sticky-copy-card">
            <Flex direction="column" gap="3" p="4">
              {!copyRunning && !copyPaused ? (
                <>
                  <Flex align="center" gap="2" minWidth="0">
                    <Box flexGrow="1" minWidth="0">
                      <TextField.Root
                        size="2"
                        value={activeDir ?? ''}
                        placeholder="选择复制目标目录…"
                        readOnly
                        title={activeDir || undefined}
                        disabled={copyBusy}
                        onClick={() => void handlePickTarget()}
                        className="dir-input"
                      />
                    </Box>

                    <Box flexShrink="0">
                      <Button
                        size="2"
                        variant="soft"
                        color="gray"
                        type="button"
                        disabled={copyBusy}
                        onClick={() => void handlePickTarget()}
                      >
                        {activeDir ? '更换目录' : '选择目录'}
                      </Button>
                    </Box>

                    {activeDir && copyFinished ? (
                      <Box flexShrink="0">
                        <Button
                          size="2"
                          variant="outline"
                          color="gray"
                          type="button"
                          onClick={handleReveal}
                          title="在文件资源管理器中打开目标目录"
                        >
                          <ExternalLink size={14} strokeWidth={1.75} />
                          打开
                        </Button>
                      </Box>
                    ) : null}

                    <Box flexShrink="0">
                      <Button
                        size="2"
                        type="button"
                        disabled={!canCopy || copyBusy}
                        onClick={onStartCopyClick}
                      >
                        {copyBusy ? (
                          <Spinner size="1" />
                        ) : (
                          <Download size={14} strokeWidth={1.75} />
                        )}
                        {copyFinished ? '重新复制' : '开始复制'}
                        {pickedCount > 0 ? ` (${pickedCount}张)` : ''}
                      </Button>
                    </Box>
                  </Flex>

                  <Flex align="center" justify="between" gap="2" wrap="wrap">
                    <Flex align="center" gap="2" wrap="wrap">
                      <Text size="2" color="gray" className="tabular">
                        已选 {selectedCount}/{machineStats.length} 台
                        {sizeLabel ? ` · 预估 ${sizeLabel}` : ''} ·{' '}
                        {COPY_LAYOUT_LABEL[layout]} ·{' '}
                        {COPY_CONFLICT_LABEL[conflict]}
                      </Text>
                      {copySucceededClean && copyTask ? (
                        <Flex align="center" gap="1">
                          <CircleCheck
                            size={14}
                            strokeWidth={1.75}
                            className="copy-done-icon"
                          />
                          <Text size="2" color="green" className="tabular">
                            已复制 {copyTask.progress.copied} 张
                            {copyTask.progress.alreadyExists > 0
                              ? ` · 已存在 ${copyTask.progress.alreadyExists}`
                              : ''}
                            {copyTask.progress.skipped > 0
                              ? ` · 跳过 ${copyTask.progress.skipped}`
                              : ''}
                          </Text>
                        </Flex>
                      ) : null}
                    </Flex>
                    <Button variant="ghost" color="gray" asChild>
                      <Link to={ROUTES.SETTINGS}>设置</Link>
                    </Button>
                  </Flex>

                  {/* 部分复制失败警告 + 重试 + 失败明细 */}
                  {hasCopyFailures && copyTask ? (
                    <Flex direction="column" gap="2">
                      <Callout.Root color="amber" size="1">
                        <Callout.Icon>
                          <TriangleAlert size={14} strokeWidth={1.75} />
                        </Callout.Icon>
                        <Flex
                          align="center"
                          justify="between"
                          gap="2"
                          wrap="wrap"
                          width="100%"
                        >
                          <Callout.Text>
                            已复制 {copyTask.progress.copied} 张，
                            <Strong>{failedCount} 张复制失败</Strong>
                            {copyTask.progress.alreadyExists > 0
                              ? `（已存在 ${copyTask.progress.alreadyExists}）`
                              : ''}
                          </Callout.Text>
                          <Flex align="center" gap="2" flexShrink="0">
                            {copyTask.failures.length > 0 ? (
                              <Button
                                type="button"
                                variant="ghost"
                                color="gray"
                                size="1"
                                onClick={() => setShowFailures(!showFailures)}
                              >
                                {showFailures ? '收起明细' : '查看明细'}
                              </Button>
                            ) : null}
                            <Button
                              type="button"
                              variant="soft"
                              color="red"
                              size="1"
                              disabled={copyBusy}
                              onClick={() => void handleRetry()}
                            >
                              <RotateCcw size={12} strokeWidth={1.75} />
                              重试失败项（{failedCount}）
                            </Button>
                          </Flex>
                        </Flex>
                      </Callout.Root>

                      {showFailures && copyTask.failures.length > 0 ? (
                        <Box
                          maxHeight="160px"
                          width="100%"
                          className="copy-failure-list"
                        >
                          <ScrollArea
                            type="auto"
                            size="1"
                            scrollbars="vertical"
                          >
                            {copyTask.failures.map((failure) => (
                              <Flex
                                key={`${failure.path}-${failure.to}`}
                                direction="column"
                                gap="1"
                                p="2"
                                className="copy-failure-row"
                              >
                                <Code
                                  variant="ghost"
                                  size="1"
                                  color="gray"
                                  highContrast
                                  truncate
                                  title={failure.path}
                                >
                                  {failure.path}
                                </Code>
                                <Text
                                  size="1"
                                  color="red"
                                  truncate
                                  title={failure.reason}
                                >
                                  {failure.reason}
                                </Text>
                              </Flex>
                            ))}
                          </ScrollArea>
                        </Box>
                      ) : null}
                    </Flex>
                  ) : null}

                  {copyError ? (
                    <Callout.Root color="red" size="1">
                      <Callout.Icon>
                        <TriangleAlert size={14} strokeWidth={1.75} />
                      </Callout.Icon>
                      <Callout.Text>
                        复制失败：{copyError}
                        <Button
                          type="button"
                          variant="soft"
                          size="1"
                          ml="2"
                          onClick={() => void handleRetry()}
                        >
                          重试
                        </Button>
                      </Callout.Text>
                    </Callout.Root>
                  ) : null}
                </>
              ) : (
                <Flex direction="column" gap="2">
                  <Flex align="center" justify="between" gap="3">
                    <Flex align="center" gap="2">
                      {copyRunning ? <Spinner size="1" /> : null}
                      <Text size="2" weight="medium">
                        {copyPaused ? '复制已暂停' : '正在复制到本地…'}
                      </Text>
                    </Flex>
                    <Text size="2" weight="bold" className="tabular">
                      {copyPercent}%
                    </Text>
                  </Flex>

                  <Progress value={copyPercent} size="2" />

                  <Flex
                    align="center"
                    justify="between"
                    gap="3"
                    className="tabular"
                  >
                    <Text size="2" color="gray">
                      已复制 {copyDone}/{preview?.total ?? pickedCount} 张
                      {copyTask && copyTask.progress.bytesPerSecond > 0
                        ? ` · ${formatFileSize(copyTask.progress.bytesPerSecond)}/s`
                        : ''}
                    </Text>
                    <Flex align="center" gap="2">
                      {copyPaused ? (
                        <Button
                          size="1"
                          variant="soft"
                          onClick={() => void handleCopyResume()}
                        >
                          <Play size={13} strokeWidth={1.75} /> 继续
                        </Button>
                      ) : (
                        <Button
                          size="1"
                          variant="soft"
                          onClick={() => void handleCopyPause()}
                        >
                          <Pause size={13} strokeWidth={1.75} /> 暂停
                        </Button>
                      )}
                      <Button
                        size="1"
                        variant="outline"
                        color="red"
                        onClick={() => void handleCopyCancel()}
                      >
                        <Square size={13} strokeWidth={1.75} /> 取消
                      </Button>
                    </Flex>
                  </Flex>
                </Flex>
              )}
            </Flex>
          </Card>
        </Box>
      ) : null}

      {/* 重名覆盖确认（破坏性操作使用 AlertDialog） */}
      <AlertDialog.Root
        open={confirmOverwrite}
        onOpenChange={setConfirmOverwrite}
      >
        <AlertDialog.Content maxWidth="400px">
          <AlertDialog.Title>确认覆盖已有文件？</AlertDialog.Title>
          <AlertDialog.Description size="2">
            目标目录里已经存在 {preview?.conflicts ?? 0} 个同名文件，
            继续复制会直接覆盖它们，无法撤销。
          </AlertDialog.Description>
          <Flex gap="3" justify="end" mt="4">
            <AlertDialog.Cancel>
              <Button variant="soft" color="gray">
                取消
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
              <Button
                color="red"
                onClick={() => {
                  setConfirmOverwrite(false)
                  void handleStart()
                }}
              >
                确认覆盖
              </Button>
            </AlertDialog.Action>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </Flex>
  )
}

export default ScanTaskPanel
