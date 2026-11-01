import { useState } from 'react'
import { Link } from 'react-router'
import {
  CheckCircledIcon,
  DownloadIcon,
  ExclamationTriangleIcon,
  OpenInNewWindowIcon,
  PauseIcon,
  PlayIcon,
  ResetIcon,
  StopIcon,
} from '@radix-ui/react-icons'
import {
  Badge,
  Box,
  Button,
  Callout,
  Checkbox,
  Dialog,
  Flex,
  Grid,
  Progress,
  ScrollArea,
  Spinner,
  Strong,
  Text,
} from '@radix-ui/themes'

import { Field } from '@/components/Field'
import { EmptyState } from '@/components/EmptyState'
import { useImageCopy } from './useImageCopy'
import { copyStoreOf } from './copyStore'
import { selectPreferences, useSettingsStore } from '@/features/settings'
import type { CopyConflictPolicy, CopyStatus, ScanCategory } from '@shared/ipc'
import { COPY_CONFLICT_LABEL, COPY_LAYOUT_LABEL } from '@shared/ipc'
import { formatDuration, formatEta } from '@/utils/common'

const STATUS_META: Record<
  CopyStatus,
  {
    label: string
    color: 'blue' | 'gray' | 'green' | 'red' | 'amber'
    variant: 'solid' | 'soft' | 'outline' | 'surface'
  }
> = {
  pending: { label: '待开始', color: 'gray', variant: 'outline' },
  running: { label: '复制中', color: 'blue', variant: 'soft' },
  paused: { label: '已暂停', color: 'amber', variant: 'soft' },
  completed: { label: '已完成', color: 'green', variant: 'soft' },
  canceled: { label: '已取消', color: 'gray', variant: 'surface' },
  failed: { label: '失败', color: 'red', variant: 'soft' },
}

const CONFLICT_VERB: Record<CopyConflictPolicy, string> = {
  rename: '自动编号后全部复制',
  skip: '整组跳过',
  overwrite: '覆盖',
}

interface CopyPanelProps {
  category: ScanCategory
  showToast: (
    title: string,
    message: string,
    type: 'success' | 'error' | 'info',
  ) => void
}

const CopyPanel = ({ category, showToast }: CopyPanelProps) => {
  const copyStore = copyStoreOf(category)

  const {
    machineStats,
    pickedCount,
    preview,
    previewing,
    targetDir,
    busy,
    error,
    running,
    paused,
    percent,
    canCopy,
    handleStart,
    handlePause,
    handleResume,
    handleCancel,
    handleRetry,
    handleChangeTarget,
    handleReveal,
    handlePickTarget,
  } = useImageCopy({ category, showToast })

  const machines = copyStore((state) => state.machines)
  const showFailures = copyStore((state) => state.showFailures)
  const toggleMachine = copyStore((state) => state.toggleMachine)
  const setMachines = copyStore((state) => state.setMachines)
  const setShowFailures = copyStore((state) => state.setShowFailures)

  const preferences = useSettingsStore(selectPreferences)
  const layout = preferences.copyLayout
  const conflict = preferences.copyConflict

  const task = copyStore((state) => state.task)
  const [confirmOverwrite, setConfirmOverwrite] = useState(false)

  const allPicked = machines.length === 0
  const meta = task ? STATUS_META[task.status] : null
  const finished = task
    ? task.status === 'completed' ||
      task.status === 'canceled' ||
      task.status === 'failed'
    : false

  const eta =
    task && task.status === 'running' ? formatEta(task.progress.etaMs) : null

  const activeDir = task?.progress.targetDir ?? targetDir
  const activeDirName = activeDir.split(/[\\/]/).filter(Boolean).pop() ?? ''

  const optionSummary = (
    <Flex align="center" justify="between" gap="2">
      <Text size="1" color="gray">
        <Strong>{COPY_LAYOUT_LABEL[layout]}</Strong>
        <Text color="gray" mx="1">
          ·
        </Text>
        {COPY_CONFLICT_LABEL[conflict]}
      </Text>
      <Button variant="ghost" size="1" color="gray" asChild>
        <Link to="/settings">修改</Link>
      </Button>
    </Flex>
  )

  if (!machineStats.length) {
    return (
      <Flex direction="column" gap="4">
        <EmptyState
          icon={<DownloadIcon width={18} height={18} />}
          title="暂无可复制的图片"
          description="完成一次扫描并命中图片后，这里会出现机台列表供勾选复制。"
        />
        {optionSummary}
      </Flex>
    )
  }

  return (
    <Flex direction="column" gap="5">
      {/* 目标目录 */}
      <Field
        label="目标目录"
        actions={
          activeDir ? (
            <Button
              variant="ghost"
              size="1"
              color="gray"
              onClick={handleReveal}
            >
              <OpenInNewWindowIcon width={13} height={13} />
              打开
            </Button>
          ) : undefined
        }
        hint={
          activeDir
            ? undefined
            : '复制前必须选好目标目录；主进程不会自己弹框，避免对话框关掉了任务却已经开始。'
        }
      >
        <Flex className="field-row" align="center" gap="2">
          <Flex
            className="target-dir"
            align="center"
            gap="2"
            data-empty={!activeDir}
          >
            <Text size="1" truncate color={activeDir ? undefined : 'gray'}>
              {activeDir || '尚未选择目标目录'}
            </Text>
          </Flex>
          <Button
            variant="outline"
            size="2"
            disabled={busy || running || paused}
            onClick={() =>
              void (task && finished && task.progress.targetDir
                ? handleChangeTarget()
                : handlePickTarget())
            }
          >
            {activeDir ? '更换' : '选择目录'}
          </Button>
        </Flex>
      </Field>

      {/* 勾选机台 */}
      <Field
        label="要复制的机台"
        count={`已选 ${allPicked ? machineStats.length : machines.length}/${machineStats.length} 台 · ${pickedCount} 张`}
        actions={
          <Button
            variant="ghost"
            size="1"
            color="gray"
            onClick={() =>
              setMachines(
                allPicked ? [] : machineStats.map((item) => item.machine),
              )
            }
          >
            {allPicked ? '取消全选' : '全选'}
          </Button>
        }
        hint="不勾选任何机台等同于复制全部机台的图片。"
      >
        <ScrollArea type="auto" scrollbars="vertical" className="choice-scroll">
          <Grid className="machine-grid" gap="1">
            {machineStats.map((item) => {
              const checked = allPicked || machines.includes(item.machine)

              const handleToggle = () => {
                if (running || paused) return

                if (allPicked) {
                  const rest = machineStats
                    .map((entry) => entry.machine)
                    .filter((name) => name !== item.machine)

                  setMachines(rest)
                  return
                }

                toggleMachine(item.machine)
              }

              return (
                <Flex
                  key={item.machine}
                  className="machine-item"
                  align="center"
                  gap="2"
                  data-disabled={running || paused || undefined}
                  data-dimmed={running || undefined}
                  onClick={handleToggle}
                >
                  <Checkbox
                    size="1"
                    checked={checked}
                    disabled={running || paused}
                    aria-label={item.machine}
                    onClick={(event) => event.stopPropagation()}
                    onCheckedChange={handleToggle}
                  />
                  <Text
                    as="span"
                    size="1"
                    truncate
                    className="machine-item-label"
                    title={item.machine}
                  >
                    {item.machine}
                  </Text>
                  <Text
                    as="span"
                    size="1"
                    color="gray"
                    className="machine-item-count"
                  >
                    {item.images}
                  </Text>
                </Flex>
              )
            })}
          </Grid>
        </ScrollArea>
      </Field>

      {/* 复制选项与预览 */}
      <Box>
        {optionSummary}

        {previewing && !preview ? (
          <Flex align="center" gap="1" mt="2">
            <Spinner size="1" />
            <Text size="1" color="gray">
              正在计算复制规模
            </Text>
          </Flex>
        ) : null}

        {preview ? (
          <Text size="1" color="gray">
            将复制 <Strong>{preview.total}</Strong> 张
            {preview.folders.length > 0
              ? `，创建 ${preview.folders.length} 个分组目录`
              : '，全部平铺在目标目录下'}
            {preview.folders.length > 0 ? (
              <Text color="gray" ml="1" className="mono">
                （{preview.folders.slice(0, 3).join('、')}
                {preview.folders.length > 3 ? '…' : ''}）
              </Text>
            ) : null}
            {preview.conflicts > 0 ? (
              <Text
                ml="1"
                weight="medium"
                color={conflict === 'overwrite' ? 'red' : 'amber'}
              >
                ；命中 {preview.conflicts} 个同名文件，将
                {CONFLICT_VERB[conflict]}
              </Text>
            ) : null}
          </Text>
        ) : null}
      </Box>

      {/* 控制按钮 */}
      <Flex className="action-bar" wrap="wrap" align="center" gap="2">
        {!running && !paused ? (
          <Button
            size="2"
            variant="solid"
            onClick={() => {
              if (conflict === 'overwrite' && (preview?.conflicts ?? 0) > 0) {
                setConfirmOverwrite(true)
                return
              }
              void handleStart()
            }}
            disabled={!canCopy}
          >
            {busy ? (
              <Spinner size="1" />
            ) : (
              <DownloadIcon width={15} height={15} />
            )}
            {finished ? '重新复制' : '开始复制'}
          </Button>
        ) : (
          <>
            {paused ? (
              <Button
                size="2"
                onClick={() => void handleResume()}
                disabled={busy}
              >
                <PlayIcon width={15} height={15} />
                继续
              </Button>
            ) : (
              <Button
                size="2"
                variant="outline"
                onClick={() => void handlePause()}
                disabled={busy}
              >
                <PauseIcon width={15} height={15} />
                暂停
              </Button>
            )}
            <Button
              size="2"
              variant="outline"
              onClick={() => void handleCancel()}
              disabled={busy}
            >
              <StopIcon width={15} height={15} />
              取消
            </Button>
          </>
        )}

        {finished && (task?.progress.failed ?? 0) > 0 ? (
          <Button
            size="2"
            variant="outline"
            onClick={() => void handleRetry()}
            disabled={busy}
          >
            <ResetIcon width={15} height={15} />
            重试失败项（{task?.progress.failed}）
          </Button>
        ) : null}
      </Flex>

      {error ? (
        <Callout.Root color="red" size="1">
          <Callout.Icon>
            <ExclamationTriangleIcon width={14} height={14} />
          </Callout.Icon>
          <Callout.Text>
            <Strong>复制失败：</Strong> {error}
          </Callout.Text>
        </Callout.Root>
      ) : null}

      {/* 进度 */}
      {task ? (
        <Box className="copy-progress">
          <Flex direction="column" gap="2">
            <Flex justify="between" align="center">
              <Flex align="center" gap="2">
                {meta ? (
                  <Badge color={meta.color} variant={meta.variant}>
                    {meta.label}
                  </Badge>
                ) : null}
                {task.progress.batchTotal > 1 ? (
                  <Text size="1" color="gray" className="tabular">
                    第 {task.progress.batchIndex}/{task.progress.batchTotal} 批
                  </Text>
                ) : null}
              </Flex>
              <Text size="1" color="gray" className="tabular">
                {task.progress.skipped > 0
                  ? `已完成 ${task.progress.copied + task.progress.failed + task.progress.skipped} / ${task.progress.total} 张`
                  : `${task.progress.copied} / ${task.progress.total} 张`}
                {task.progress.skipped > 0
                  ? ` · 跳过 ${task.progress.skipped}`
                  : ''}
                {task.progress.failed > 0
                  ? ` · 失败 ${task.progress.failed}`
                  : ''}
                {task.progress.renamed > 0
                  ? ` · 改名 ${task.progress.renamed}`
                  : ''}
              </Text>
            </Flex>

            <Progress value={percent} size="2" />

            <Flex wrap="wrap" gap="3">
              <Text size="1" color="gray" className="tabular">
                {formatDuration(task.progress.elapsedMs)}
              </Text>
              {eta ? (
                <Text size="1" color="gray" className="tabular">
                  剩余 {eta}
                </Text>
              ) : null}
              <Text
                size="1"
                color="gray"
                truncate
                className="mono"
                title={task.progress.currentPath}
              >
                {task.progress.currentPath}
              </Text>
            </Flex>

            {task.status === 'completed' &&
            task.progress.targetDir &&
            activeDirName ? (
              <Flex align="center" gap="1">
                <CheckCircledIcon
                  width={14}
                  height={14}
                  className="success-icon"
                />
                <Text size="1" color="gray">
                  已写入{' '}
                  <Text className="mono" title={task.progress.targetDir}>
                    {task.progress.targetDir}
                  </Text>
                </Text>
              </Flex>
            ) : null}

            {task.manifestPath ? (
              <Text size="1" color="gray" truncate>
                清单：
                <Text ml="1" className="mono">
                  {task.manifestPath}
                </Text>
              </Text>
            ) : null}

            {task.failures.length > 0 ? (
              <Flex direction="column" gap="1">
                <Button
                  variant="ghost"
                  color="red"
                  size="1"
                  className="self-start"
                  onClick={() => setShowFailures(!showFailures)}
                >
                  {showFailures
                    ? '收起失败明细'
                    : `查看失败明细（${task.failures.length}）`}
                </Button>
                {showFailures ? (
                  <ScrollArea
                    type="auto"
                    scrollbars="vertical"
                    className="failure-list"
                  >
                    {task.failures.map((failure) => (
                      <Box
                        className="failure-row"
                        key={`${failure.path}-${failure.to}`}
                        p="2"
                      >
                        <Text
                          size="1"
                          truncate
                          className="mono"
                          title={failure.path}
                        >
                          {failure.path}
                        </Text>
                        <Text
                          size="1"
                          color="red"
                          truncate
                          title={failure.reason}
                        >
                          {failure.reason}
                        </Text>
                      </Box>
                    ))}
                  </ScrollArea>
                ) : null}
              </Flex>
            ) : null}
          </Flex>
        </Box>
      ) : null}

      {/* 确认覆盖弹窗 */}
      <Dialog.Root open={confirmOverwrite} onOpenChange={setConfirmOverwrite}>
        <Dialog.Content maxWidth="450px">
          <Dialog.Title>确认覆盖已有文件？</Dialog.Title>
          <Dialog.Description size="2" color="gray" mb="3">
            目标目录里已经存在 {preview?.conflicts ?? 0} 个同名文件，
            继续会用源文件覆盖它们，覆盖后无法撤销。
          </Dialog.Description>
          <Flex className="target-dir" align="center" gap="2" mb="3">
            <Text size="1" truncate>
              {activeDir}
            </Text>
          </Flex>
          <Flex gap="3" justify="end">
            <Dialog.Close>
              <Button variant="soft" color="gray">
                取消
              </Button>
            </Dialog.Close>
            <Button
              color="red"
              disabled={busy}
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
    </Flex>
  )
}

export default CopyPanel
