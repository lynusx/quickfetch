import { useState } from 'react'
import { Link } from 'react-router'
import {
  DownloadIcon,
  ExclamationTriangleIcon,
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
  Checkbox,
  Dialog,
  Flex,
  Grid,
  ScrollArea,
  Spinner,
  Strong,
  Text,
} from '@radix-ui/themes'

import { Field } from '@/components/field'
import { EmptyState } from '@/components/empty-state/empty-state'
import { ROUTES } from '@/routes/paths'
import { useImageCopy } from './useImageCopy'
import { copyStoreOf } from './copyStore'
import CopyProgress from './copy-progress'
import { previewSizeLabel } from './copyReadModel'
import { selectPreferences, useSettingsStore } from '@/features/settings'
import type { CopyConflictPolicy, ScanCategory } from '@shared/ipc'
import { COPY_CONFLICT_LABEL, COPY_LAYOUT_LABEL } from '@shared/ipc'
import './copy.css'

const CONFLICT_VERB: Record<CopyConflictPolicy, string> = {
  rename: '自动编号后全部复制',
  skip: '只跳过同名的那张',
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
    preview,
    previewing,
    targetDir,
    readModel,
    busy,
    error,
    canCopy,
    handleStart,
    handlePause,
    handleResume,
    handleCancel,
    handleRetry,
    handleReveal,
    handlePickTarget,
  } = useImageCopy({ category, showToast })

  const machines = copyStore((state) => state.machines)
  const showFailures = copyStore((state) => state.showFailures)
  const toggleMachine = copyStore((state) => state.toggleMachine)
  const setMachines = copyStore((state) => state.setMachines)
  const selectAll = copyStore((state) => state.selectAll)
  const setShowFailures = copyStore((state) => state.setShowFailures)

  const preferences = useSettingsStore(selectPreferences)
  const layout = preferences.copyLayout
  const conflict = preferences.copyConflict

  const task = copyStore((state) => state.task)
  const [confirmOverwrite, setConfirmOverwrite] = useState(false)

  const {
    selectedCount,
    allSelected,
    pickedCount,
    running,
    paused,
    finished,
    activeDir,
    done,
    percent,
  } = readModel

  const sizeLabel = previewSizeLabel(preview, previewing)

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
        <Link to={ROUTES.SETTINGS}>修改</Link>
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
            ? finished &&
              targetDir &&
              task?.progress.targetDir &&
              targetDir !== task.progress.targetDir
              ? '已更换目标目录，点「重新复制」后才会写入新目录。'
              : undefined
            : '复制前必须选好目标目录；主进程不会自己弹框，避免对话框关掉了任务却已经开始。'
        }
      >
        <Flex align="center" gap="2">
          <Flex
            className="target-dir"
            align="center"
            gap="2"
            flexGrow="1"
            minWidth="0"
            height="34px"
            px="2"
            data-empty={!activeDir}
          >
            <Text size="1" truncate color={activeDir ? undefined : 'gray'}>
              {activeDir || '尚未选择目标目录'}
            </Text>
          </Flex>
          <Button
            variant="outline"
            disabled={busy || running || paused}
            onClick={() => void handlePickTarget()}
          >
            {activeDir ? '更换' : '选择目录'}
          </Button>
        </Flex>
      </Field>

      {/* 勾选机台 */}
      <Field
        label="要复制的机台"
        count={`已选 ${selectedCount}/${machineStats.length} 台 · ${pickedCount} 张${
          sizeLabel ? ` · ${sizeLabel}` : ''
        }`}
        actions={
          <Button
            variant="ghost"
            size="1"
            color="gray"
            disabled={running || paused}
            onClick={() =>
              allSelected
                ? setMachines([])
                : selectAll(machineStats.map((item) => item.machine))
            }
          >
            {allSelected ? '取消全选' : '全选'}
          </Button>
        }
        hint="至少勾选 1 台机台后才能开始复制。"
      >
        <ScrollArea type="auto" scrollbars="vertical" className="choice-scroll">
          <Grid className="machine-grid" gap="1" p="2">
            {machineStats.map((item) => {
              const checked = machines.includes(item.machine)

              const handleToggle = () => {
                if (running || paused) return

                toggleMachine(item.machine)
              }

              return (
                <Flex
                  key={item.machine}
                  className="machine-item"
                  align="center"
                  gap="2"
                  minWidth="0"
                  py="1"
                  px="2"
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
                    size="1"
                    truncate
                    className="machine-item-label"
                    title={item.machine}
                  >
                    {item.machine}
                  </Text>
                  <Text size="1" color="gray" className="machine-item-count">
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
      <Flex wrap="wrap" align="center" gap="2">
        {!running && !paused ? (
          <Button
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
              <Button onClick={() => void handleResume()} disabled={busy}>
                <PlayIcon width={15} height={15} />
                继续
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => void handlePause()}
                disabled={busy}
              >
                <PauseIcon width={15} height={15} />
                暂停
              </Button>
            )}
            <Button
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

      {task ? (
        <CopyProgress
          task={task}
          percent={percent}
          done={done}
          showFailures={showFailures}
          onToggleFailures={() => setShowFailures(!showFailures)}
        />
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
            <Text size="1" truncate color="gray">
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
