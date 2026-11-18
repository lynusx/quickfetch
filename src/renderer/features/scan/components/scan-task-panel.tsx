import type { ReactNode } from 'react'
import { useState } from 'react'
import { Link } from 'react-router'
import {
  DownloadIcon,
  ExclamationTriangleIcon,
  InfoCircledIcon,
  OpenInNewWindowIcon,
  PauseIcon,
  PlayIcon,
  ResetIcon,
  StopIcon,
} from '@radix-ui/react-icons'
import {
  Box,
  Button,
  Callout,
  Card,
  Checkbox,
  Code,
  DataList,
  Dialog,
  Flex,
  Progress,
  ScrollArea,
  Separator,
  Spinner,
  Strong,
  Table,
  Text,
  TextField,
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
  task: ScanTask | null
  creating: boolean
  busy: boolean
  ready: boolean
  missing?: string[]
  canStart: boolean
  error?: string | null
  notices?: ReactNode
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
 * 扫描与就地复制统一单列任务流。
 *
 * 彻底消除分离的复制面板与重复机台列表，将右侧精炼为单列流：
 * 1. 顶层状态与主控：主操作、极简进度条与单行核心统计；
 * 2. 中部机台看板：单列 Table 同时承担结果展示与就地勾选复制；
 * 3. 底部目标与复制：单行目录路径配置与复制触发，复制时原地演变为进度。
 */
export const ScanTaskPanel = ({
  category,
  task,
  creating,
  busy,
  ready,
  missing,
  canStart,
  error,
  notices,
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

  return (
    <Card size="2">
      <Flex direction="column" gap="4">
        {/* 1. 顶层状态与主控条 */}
        <Flex align="center" justify="between" gap="3" wrap="wrap">
          <Flex align="center" gap="2">
            {!busy ? (
              <Button size="2" onClick={onStart} disabled={!canStart}>
                {creating ? (
                  <Spinner size="1" />
                ) : (
                  <PlayIcon width={14} height={14} />
                )}
                {task ? '重新扫描' : '开始扫描'}
              </Button>
            ) : (
              <>
                {task?.status === 'paused' ? (
                  <Button size="2" onClick={onResume}>
                    <PlayIcon width={14} height={14} /> 继续
                  </Button>
                ) : (
                  <Button
                    size="2"
                    variant="outline"
                    onClick={onPause}
                    disabled={task?.status !== 'running'}
                  >
                    <PauseIcon width={14} height={14} /> 暂停
                  </Button>
                )}
                <Button size="2" variant="outline" onClick={onCancel}>
                  <StopIcon width={14} height={14} /> 取消
                </Button>
              </>
            )}

            {task && !busy ? (
              <Button
                size="2"
                variant="ghost"
                color="gray"
                onClick={onClear}
                title="清除扫描结果"
              >
                <ResetIcon width={14} height={14} />
              </Button>
            ) : null}

            {task ? <ScanStatusBadge status={task.status} size="1" /> : null}
          </Flex>

          {/* 结构化关键指标 */}
          {task ? (
            <DataList.Root orientation="horizontal" size="1">
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
                  <Text size="1" color="gray" className="tabular">
                    {elapsedLabel(task)}
                  </Text>
                </DataList.Value>
              </DataList.Item>
              {task.progress.dirsScanned > 0 ? (
                <DataList.Item align="center">
                  <DataList.Label minWidth="auto">目录</DataList.Label>
                  <DataList.Value>
                    <Text size="1" color="gray" className="tabular">
                      {task.progress.dirsScanned}
                    </Text>
                  </DataList.Value>
                </DataList.Item>
              ) : null}
            </DataList.Root>
          ) : !ready && missing?.length ? (
            <Text size="1" color="gray">
              请先在上方选择{missing.join('、')}
            </Text>
          ) : null}
        </Flex>

        {/* 扫描进度（仅在执行或有进度时展示） */}
        {task && (busy || task.progress.percent > 0) ? (
          <Box>
            <Progress value={task.progress.percent} size="2" />
            <Flex justify="between" align="center" mt="1" className="tabular">
              <Text size="1" color="gray">
                {view.phaseDescription || `${task.progress.percent}%`}
                {view.machinesPending > 0 &&
                  ` · 等待 ${view.machinesPending} 台`}
                {view.etaText && ` · 剩余 ${view.etaText}`}
              </Text>
              <Text size="1" weight="medium" color="gray">
                {task.progress.percent}%
              </Text>
            </Flex>
          </Box>
        ) : null}

        {/* 异常与阻断通知 */}
        {(other ||
          notices ||
          (error ?? task?.error) ||
          (task?.status === 'completed' && task.totalImages === 0)) && (
          <Flex direction="column" gap="2">
            {other && otherLabel ? (
              <Callout.Root color="blue" size="1">
                <Callout.Icon>
                  <ExclamationTriangleIcon width={14} height={14} />
                </Callout.Icon>
                <Callout.Text>
                  <Strong>另一类扫描正在进行：</Strong> {otherLabel}
                </Callout.Text>
              </Callout.Root>
            ) : null}

            {notices}

            {task?.status === 'completed' && task.totalImages === 0 ? (
              <Callout.Root color="amber" size="1">
                <Callout.Icon>
                  <InfoCircledIcon width={14} height={14} />
                </Callout.Icon>
                <Callout.Text>
                  <Strong>没有命中图片：</Strong>
                  请检查机台、日期、班次与类型；下方各机台保留了断链原因。
                </Callout.Text>
              </Callout.Root>
            ) : null}

            {task?.status === 'paused' && task.pauseReason === 'network' ? (
              <Callout.Root color="red" size="1">
                <Callout.Icon>
                  <ExclamationTriangleIcon width={14} height={14} />
                </Callout.Icon>
                <Callout.Text>
                  <Strong>网络不通，任务已暂停：</Strong> {networkHint}
                </Callout.Text>
              </Callout.Root>
            ) : null}

            {(error ?? task?.error) ? (
              <Callout.Root color="red" size="1">
                <Callout.Icon>
                  <ExclamationTriangleIcon width={14} height={14} />
                </Callout.Icon>
                <Callout.Text>
                  <Strong>扫描失败：</Strong> {error ?? task?.error}
                </Callout.Text>
              </Callout.Root>
            ) : null}
          </Flex>
        )}

        {/* 2. 中部单列机台结果与勾选清单 */}
        {task && task.status !== 'pending' && view.rows.length > 0 ? (
          <Box maxHeight="320px">
            <ScrollArea type="auto" size="2" scrollbars="vertical">
              <Table.Root variant="surface" size="1">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeaderCell width="40px">
                      <Checkbox
                        size="1"
                        checked={
                          allSelectableChecked
                            ? true
                            : someSelectableChecked
                              ? 'indeterminate'
                              : false
                        }
                        disabled={
                          copyRunning ||
                          copyPaused ||
                          selectableRows.length === 0
                        }
                        onCheckedChange={toggleAll}
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

                    return (
                      <Table.Row key={row.machine} align="center">
                        <Table.Cell>
                          <Checkbox
                            size="1"
                            checked={isChecked}
                            disabled={!hasImages || copyRunning || copyPaused}
                            onCheckedChange={(checked) =>
                              toggleRow(row.machine, checked)
                            }
                          />
                        </Table.Cell>
                        <Table.RowHeaderCell>
                          <Code variant="ghost" size="1" highContrast>
                            {row.machine}
                          </Code>
                        </Table.RowHeaderCell>
                        <Table.Cell>
                          <Flex
                            align="center"
                            gap="2"
                            minWidth="0"
                            title={row.detail ?? undefined}
                          >
                            <Box
                              as="span"
                              className="status-dot"
                              data-tone={DOT_TONE[row.tone] || undefined}
                            />
                            <Text
                              size="1"
                              color={STATUS_TEXT_COLOR[row.tone] ?? 'gray'}
                              truncate
                            >
                              {row.statusText}
                            </Text>
                          </Flex>
                        </Table.Cell>
                        <Table.Cell align="right">
                          <Text
                            size="1"
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
            </ScrollArea>
          </Box>
        ) : (
          <Box py="6" px="4">
            <Flex direction="column" align="center" justify="center" gap="2">
              <Text size="2" color="gray">
                {!ready
                  ? '在上方选齐机台与时段后，即可开始扫描'
                  : '点击上方「开始扫描」，收集各机台图片'}
              </Text>
              {missing && missing.length > 0 ? (
                <Text size="1" color="gray">
                  未选：{missing.join('、')}
                </Text>
              ) : null}
            </Flex>
          </Box>
        )}

        {/* 3. 底部目标目录与复制执行 */}
        {task && task.totalImages > 0 ? (
          !copyRunning && !copyPaused ? (
            <Flex direction="column" gap="3" mt="2">
              <Separator size="4" />
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
                      <OpenInNewWindowIcon width={14} height={14} />
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
                    <DownloadIcon width={14} height={14} />
                    {copyFinished ? '重新复制' : '开始复制'}
                    {pickedCount > 0 ? ` (${pickedCount}张)` : ''}
                  </Button>
                </Box>
              </Flex>

              {/* 紧凑辅助说明与偏好快捷入口 */}
              <Flex align="center" justify="between" gap="2">
                <Text size="1" color="gray" className="tabular">
                  已选 {selectedCount}/{machineStats.length} 台
                  {sizeLabel ? ` · 预估 ${sizeLabel}` : ''} ·{' '}
                  {COPY_LAYOUT_LABEL[layout]} · {COPY_CONFLICT_LABEL[conflict]}
                </Text>
                <Button variant="ghost" size="1" color="gray" asChild>
                  <Link to={ROUTES.SETTINGS}>修改偏好</Link>
                </Button>
              </Flex>

              {copyError ? (
                <Callout.Root color="red" size="1">
                  <Callout.Icon>
                    <ExclamationTriangleIcon width={14} height={14} />
                  </Callout.Icon>
                  <Callout.Text>
                    复制失败：{copyError}
                    <Button
                      variant="soft"
                      size="1"
                      ml="2"
                      onClick={handleRetry}
                    >
                      重试
                    </Button>
                  </Callout.Text>
                </Callout.Root>
              ) : null}
            </Flex>
          ) : (
            <Flex direction="column" gap="2" mt="2">
              <Separator size="4" />
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
                <Text size="1" color="gray">
                  已复制 {copyDone}/{preview?.total ?? pickedCount} 张
                  {copyTask && copyTask.progress.bytesPerSecond > 0
                    ? ` · ${formatFileSize(copyTask.progress.bytesPerSecond)}/s`
                    : ''}
                </Text>
                <Flex align="center" gap="2">
                  {copyPaused ? (
                    <Button size="1" variant="soft" onClick={handleCopyResume}>
                      <PlayIcon width={13} height={13} /> 继续
                    </Button>
                  ) : (
                    <Button size="1" variant="soft" onClick={handleCopyPause}>
                      <PauseIcon width={13} height={13} /> 暂停
                    </Button>
                  )}
                  <Button
                    size="1"
                    variant="outline"
                    color="red"
                    onClick={handleCopyCancel}
                  >
                    <StopIcon width={13} height={13} /> 取消
                  </Button>
                </Flex>
              </Flex>
            </Flex>
          )
        ) : null}
      </Flex>

      {/* 重名覆盖确认对话框 */}
      <Dialog.Root open={confirmOverwrite} onOpenChange={setConfirmOverwrite}>
        <Dialog.Content size="2" maxWidth="400px">
          <Dialog.Title>确认覆盖已有文件</Dialog.Title>
          <Dialog.Description size="2">
            目标目录里已经存在 {preview?.conflicts ?? 0} 个同名文件，
            继续复制会直接覆盖它们，不可恢复。
          </Dialog.Description>
          <Flex gap="3" justify="end" mt="4">
            <Dialog.Close>
              <Button variant="soft" color="gray">
                取消
              </Button>
            </Dialog.Close>
            <Button
              color="red"
              onClick={() => {
                setConfirmOverwrite(false)
                void handleStart()
              }}
            >
              确认覆盖
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </Card>
  )
}

export default ScanTaskPanel
