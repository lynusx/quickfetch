import { useState } from 'react'
import { Link } from 'react-router'
import {
  Download,
  ExternalLink,
  Pause,
  Play,
  RotateCcw,
  Square,
  TriangleAlert,
} from 'lucide-react'
import {
  Box,
  Button,
  Callout,
  Code,
  Dialog,
  Flex,
  Spinner,
  Strong,
  Text,
} from '@radix-ui/themes'

import { BulkActions } from '@/components/bulk-actions/bulk-actions'
import { ChoiceList } from '@/components/choice-list'
import { Field } from '@/components/field'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/empty'
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
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Download size={18} strokeWidth={1.75} />
            </EmptyMedia>
            <EmptyTitle>暂无可复制的图片</EmptyTitle>
            <EmptyDescription>
              完成一次扫描并命中图片后，这里会出现机台列表供勾选复制。
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
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
              <ExternalLink size={13} strokeWidth={1.75} />
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
            {activeDir ? (
              <Code size="1" variant="ghost" truncate>
                {activeDir}
              </Code>
            ) : (
              <Text size="1" color="gray">
                尚未选择目标目录
              </Text>
            )}
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
          <BulkActions
            onToggleAll={() =>
              allSelected
                ? setMachines([])
                : selectAll(machineStats.map((item) => item.machine))
            }
            allSelected={allSelected}
            toggleDisabled={running || paused}
          />
        }
        hint="至少勾选 1 台机台后才能开始复制。"
      >
        <ChoiceList
          columns={3}
          scroll
          disabled={running || paused}
          value={machines}
          onValueChange={setMachines}
          options={machineStats.map((item) => ({
            value: item.machine,
            label: (
              <Code variant="ghost" color="gray" highContrast size="2">
                {item.machine}
              </Code>
            ),
            meta: item.images,
            title: item.machine,
          }))}
        />
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
              <Code variant="ghost" color="gray" ml="1">
                （{preview.folders.slice(0, 3).join('、')}
                {preview.folders.length > 3 ? '…' : ''}）
              </Code>
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
              <Download size={15} strokeWidth={1.75} />
            )}
            {finished ? '重新复制' : '开始复制'}
          </Button>
        ) : (
          <>
            {paused ? (
              <Button onClick={() => void handleResume()} disabled={busy}>
                <Play size={15} strokeWidth={1.75} />
                继续
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => void handlePause()}
                disabled={busy}
              >
                <Pause size={15} strokeWidth={1.75} />
                暂停
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => void handleCancel()}
              disabled={busy}
            >
              <Square size={15} strokeWidth={1.75} />
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
            <RotateCcw size={15} strokeWidth={1.75} />
            重试失败项（{task?.progress.failed}）
          </Button>
        ) : null}
      </Flex>

      {error ? (
        <Callout.Root color="red" size="1">
          <Callout.Icon>
            <TriangleAlert size={14} strokeWidth={1.75} />
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
            <Code size="1" variant="ghost" color="gray" truncate>
              {activeDir}
            </Code>
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
