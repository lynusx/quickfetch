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
  Separator,
  Spinner,
  Strong,
  Text,
} from '@radix-ui/themes'

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
  paused: { label: '已暂停', color: 'amber', variant: 'outline' },
  completed: { label: '已完成', color: 'green', variant: 'soft' },
  canceled: { label: '已取消', color: 'gray', variant: 'outline' },
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
      <Text size="2">
        <Strong>{COPY_LAYOUT_LABEL[layout]}</Strong>
        <Text color="gray" mx="1">
          ·
        </Text>
        <Text color="gray">{COPY_CONFLICT_LABEL[conflict]}</Text>
      </Text>
      <Button variant="ghost" size="1" asChild>
        <Link to="/settings">修改</Link>
      </Button>
    </Flex>
  )

  if (!machineStats.length) {
    return (
      <Flex direction="column" gap="4">
        <Callout.Root color="gray" size="1">
          <Callout.Icon>
            <ExclamationTriangleIcon width={14} height={14} />
          </Callout.Icon>
          <Callout.Text>
            <Strong>暂无可复制的图片：</Strong>
            完成一次扫描并命中图片后，这里会出现机台列表供勾选复制
          </Callout.Text>
        </Callout.Root>
        {optionSummary}
      </Flex>
    )
  }

  return (
    <Flex direction="column" gap="4">
      {/* 目标目录 */}
      <Flex direction="column" gap="2">
        <Flex justify="between" align="center">
          <Text as="label" size="2" weight="medium">
            目标目录
            <Text color="red" ml="1">
              *
            </Text>
          </Text>
          {activeDir && (
            <Button
              variant="ghost"
              size="1"
              onClick={() => void handleReveal()}
            >
              <OpenInNewWindowIcon width={14} height={14} />
              打开
            </Button>
          )}
        </Flex>

        <Flex align="center" gap="2">
          <Box
            px="3"
            py="1"
            style={{
              flex: 1,
              minWidth: 0,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              border: activeDir
                ? '1px solid var(--gray-6)'
                : '1px dashed var(--gray-7)',
              borderRadius: 'var(--radius-2)',
              backgroundColor: activeDir
                ? 'var(--gray-3)'
                : 'var(--color-panel-solid)',
              fontFamily: 'var(--code-font-family)',
              fontSize: '12px',
            }}
            title={activeDir || undefined}
          >
            <Text size="1" truncate color={activeDir ? undefined : 'gray'}>
              {activeDir || '尚未选择，开始复制前必须先选择'}
            </Text>
          </Box>
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

        {!activeDir && (
          <Text size="1" color="gray">
            复制前必须选好目标目录，主进程不会自己弹框，避免对话框关掉了任务却已经开始。
          </Text>
        )}
      </Flex>

      <Separator size="4" />

      {/* 勾选机台 */}
      <Flex direction="column" gap="2">
        <Flex justify="between" align="center">
          <Text as="label" size="2" weight="medium">
            要复制的机台
          </Text>
          <Flex align="center" gap="2">
            <Text
              size="1"
              color="gray"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              已选 {allPicked ? machineStats.length : machines.length}/
              {machineStats.length} 台 · {pickedCount} 张
            </Text>
            <Button
              variant="ghost"
              size="1"
              onClick={() =>
                setMachines(
                  allPicked ? [] : machineStats.map((item) => item.machine),
                )
              }
            >
              {allPicked ? '取消全选' : '全选'}
            </Button>
          </Flex>
        </Flex>

        <Text size="1" color="gray">
          不勾选任何机台等同于复制全部机台的图片。
        </Text>

        <ScrollArea
          scrollbars="vertical"
          style={{
            maxHeight: 220,
            border: '1px solid var(--gray-6)',
            borderRadius: 'var(--radius-3)',
            padding: 'var(--space-2)',
            backgroundColor: 'var(--color-panel-solid)',
          }}
        >
          <Grid columns={{ initial: '2', sm: '3' }} gap="2">
            {machineStats.map((item) => {
              const checked = allPicked || machines.includes(item.machine)

              return (
                <Flex
                  key={item.machine}
                  align="center"
                  px="2"
                  py="1"
                  style={{
                    borderRadius: 'var(--radius-2)',
                    userSelect: 'none',
                    opacity: running ? 0.6 : 1,
                  }}
                >
                  <Text
                    as="label"
                    size="2"
                    style={{
                      cursor: running ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-2)',
                      width: '100%',
                      minWidth: 0,
                    }}
                  >
                    <Checkbox
                      size="1"
                      checked={checked}
                      disabled={running || paused}
                      onCheckedChange={() => {
                        if (allPicked) {
                          const rest = machineStats
                            .map((entry) => entry.machine)
                            .filter((name) => name !== item.machine)

                          setMachines(rest)
                          return
                        }
                        toggleMachine(item.machine)
                      }}
                    />
                    <Text
                      size="1"
                      truncate
                      style={{
                        flex: 1,
                        fontFamily: 'var(--code-font-family)',
                      }}
                    >
                      {item.machine}
                    </Text>
                    <Text
                      size="1"
                      color="gray"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {item.images}
                    </Text>
                  </Text>
                </Flex>
              )
            })}
          </Grid>
        </ScrollArea>
      </Flex>

      <Separator size="4" />

      {/* 复制选项 */}
      <Flex direction="column" gap="1">
        {optionSummary}

        {previewing && !preview && (
          <Flex align="center" gap="1">
            <Spinner size="1" />
            <Text size="1" color="gray">
              正在计算复制规模
            </Text>
          </Flex>
        )}

        {preview && (
          <Text size="1" color="gray">
            将复制 <Strong>{preview.total}</Strong> 张
            {preview.folders.length > 0
              ? `，创建 ${preview.folders.length} 个分组目录`
              : '，全部平铺在目标目录下'}
            {preview.folders.length > 0 && (
              <Text
                color="gray"
                ml="1"
                style={{ fontFamily: 'var(--code-font-family)' }}
              >
                （{preview.folders.slice(0, 3).join('、')}
                {preview.folders.length > 3 ? '…' : ''}）
              </Text>
            )}
            {preview.conflicts > 0 && (
              <Text
                ml="1"
                weight="medium"
                color={conflict === 'overwrite' ? 'red' : 'amber'}
              >
                ；命中 {preview.conflicts} 个同名文件，将
                {CONFLICT_VERB[conflict]}
              </Text>
            )}
          </Text>
        )}
      </Flex>

      {/* 控制按钮 */}
      <Flex wrap="wrap" align="center" gap="2">
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
              <DownloadIcon width={16} height={16} />
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
                <PlayIcon width={16} height={16} />
                继续
              </Button>
            ) : (
              <Button
                size="2"
                variant="outline"
                onClick={() => void handlePause()}
                disabled={busy}
              >
                <PauseIcon width={16} height={16} />
                暂停
              </Button>
            )}
            <Button
              size="2"
              variant="outline"
              onClick={() => void handleCancel()}
              disabled={busy}
            >
              <StopIcon width={16} height={16} />
              取消
            </Button>
          </>
        )}

        {finished && (task?.progress.failed ?? 0) > 0 && (
          <Button
            size="2"
            variant="outline"
            onClick={() => void handleRetry()}
            disabled={busy}
          >
            <ResetIcon width={16} height={16} />
            重试失败项（{task?.progress.failed}）
          </Button>
        )}
      </Flex>

      {error && (
        <Callout.Root color="red" size="1">
          <Callout.Icon>
            <ExclamationTriangleIcon width={14} height={14} />
          </Callout.Icon>
          <Callout.Text>
            <Strong>复制失败：</Strong> {error}
          </Callout.Text>
        </Callout.Root>
      )}

      {/* 进度 */}
      {task && (
        <Box
          p="3"
          style={{
            border: '1px solid var(--gray-6)',
            borderRadius: 'var(--radius-3)',
            backgroundColor: 'var(--gray-2)',
          }}
        >
          <Flex direction="column" gap="2">
            <Flex justify="between" align="center">
              <Flex align="center" gap="2">
                {meta && (
                  <Badge color={meta.color} variant={meta.variant}>
                    {meta.label}
                  </Badge>
                )}
                {task.progress.batchTotal > 1 && (
                  <Text
                    size="1"
                    color="gray"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    第 {task.progress.batchIndex}/{task.progress.batchTotal} 批
                  </Text>
                )}
              </Flex>
              <Text
                size="1"
                color="gray"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {task.progress.skipped > 0
                  ? `已完成 ${task.progress.copied + task.progress.failed + task.progress.skipped} / ${task.progress.total} 张`
                  : `${task.progress.copied} / ${task.progress.total} 张`}
                {task.progress.skipped > 0 &&
                  ` · 跳过 ${task.progress.skipped}`}
                {task.progress.failed > 0 && ` · 失败 ${task.progress.failed}`}
                {task.progress.renamed > 0 &&
                  ` · 改名 ${task.progress.renamed}`}
              </Text>
            </Flex>

            <Progress value={percent} />

            <Flex wrap="wrap" gap="3">
              <Text
                size="1"
                color="gray"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {formatDuration(task.progress.elapsedMs)}
              </Text>
              {eta && (
                <Text
                  size="1"
                  color="gray"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  剩余 {eta}
                </Text>
              )}
              <Text
                size="1"
                color="gray"
                truncate
                style={{ fontFamily: 'var(--code-font-family)' }}
                title={task.progress.currentPath}
              >
                {task.progress.currentPath}
              </Text>
            </Flex>

            {task.status === 'completed' &&
              task.progress.targetDir &&
              activeDirName && (
                <Flex align="center" gap="1">
                  <CheckCircledIcon
                    width={14}
                    height={14}
                    style={{ color: 'var(--green-9)' }}
                  />
                  <Text size="1" color="gray">
                    已写入{' '}
                    <Text
                      style={{ fontFamily: 'var(--code-font-family)' }}
                      title={task.progress.targetDir}
                    >
                      {task.progress.targetDir}
                    </Text>
                  </Text>
                </Flex>
              )}

            {task.manifestPath && (
              <Text size="1" color="gray" truncate>
                清单：
                <Text ml="1" style={{ fontFamily: 'var(--code-font-family)' }}>
                  {task.manifestPath}
                </Text>
              </Text>
            )}

            {task.failures.length > 0 && (
              <Flex direction="column" gap="1">
                <Button
                  variant="ghost"
                  color="red"
                  size="1"
                  style={{ alignSelf: 'flex-start' }}
                  onClick={() => setShowFailures(!showFailures)}
                >
                  {showFailures
                    ? '收起失败明细'
                    : `查看失败明细（${task.failures.length}）`}
                </Button>
                {showFailures && (
                  <ScrollArea
                    scrollbars="vertical"
                    style={{
                      maxHeight: 160,
                      border: '1px solid var(--gray-6)',
                      borderRadius: 'var(--radius-2)',
                      backgroundColor: 'var(--color-panel-solid)',
                    }}
                  >
                    {task.failures.map((failure) => (
                      <Box
                        key={`${failure.path}-${failure.to}`}
                        px="2"
                        py="1"
                        style={{ borderBottom: '1px solid var(--gray-4)' }}
                      >
                        <Text
                          size="1"
                          truncate
                          style={{ fontFamily: 'var(--code-font-family)' }}
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
                )}
              </Flex>
            )}
          </Flex>
        </Box>
      )}

      {/* 确认覆盖弹窗 */}
      <Dialog.Root open={confirmOverwrite} onOpenChange={setConfirmOverwrite}>
        <Dialog.Content maxWidth="450px">
          <Dialog.Title>确认覆盖已有文件？</Dialog.Title>
          <Dialog.Description size="2" color="gray" mb="3">
            目标目录里已经存在 {preview?.conflicts ?? 0} 个同名文件，
            继续会用源文件覆盖它们，覆盖后无法撤销。
          </Dialog.Description>
          <Box
            p="2"
            mb="3"
            style={{
              backgroundColor: 'var(--gray-3)',
              borderRadius: 'var(--radius-2)',
              fontFamily: 'var(--code-font-family)',
              fontSize: '12px',
            }}
          >
            <Text size="1" truncate>
              {activeDir}
            </Text>
          </Box>
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
