import { useState } from 'react'
import { animated, useTransition } from '@react-spring/web'
import { Link } from 'react-router'
import {
  CircleCheck,
  Download,
  ExternalLink,
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
  Code,
  Flex,
  Progress,
  ScrollArea,
  Spinner,
  Strong,
  Text,
  TextField,
} from '@radix-ui/themes'

import { Collapse } from '@/components/collapse'
import { SPRING_SNAPPY, useReducedMotion } from '@/lib/motion'
import { ROUTES } from '@/routes/paths'
import { formatFileSize } from '@/utils/common'
import type { ScanCategory } from '@shared/ipc'
import { COPY_CONFLICT_LABEL, COPY_LAYOUT_LABEL } from '@shared/ipc'

import { previewSizeLabel } from './copyReadModel'
import { useImageCopy } from './useImageCopy'
import './sticky-copy-bar.css'

const AnimatedBox = animated(Box)

interface StickyCopyBarProps {
  category: ScanCategory
  visible: boolean
  showToast: (
    title: string,
    message: string,
    type: 'success' | 'error' | 'info',
  ) => void
}

/**
 * 单列任务流底部的吸底复制操作栏（含重名覆盖确认弹窗与部分失败明细折叠区）。
 */
export const StickyCopyBar = ({
  category,
  visible,
  showToast,
}: StickyCopyBarProps) => {
  const {
    task: copyTask,
    machineStats,
    preview,
    previewing,
    busy: copyBusy,
    error: copyError,
    layout,
    conflict,
    showFailures,
    setShowFailures,
    readModel,
    canCopy,
    handleStart,
    handlePause,
    handleResume,
    handleCancel,
    handleRetry,
    handleReveal,
    handlePickTarget,
  } = useImageCopy({ category, showToast })

  const [confirmOverwrite, setConfirmOverwrite] = useState(false)
  const reducedMotion = useReducedMotion()

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
  const failedCount = copyTask?.progress.failed ?? 0
  const hasCopyFailures = copyFinished && failedCount > 0
  const copySucceededClean =
    copyFinished && copyTask?.status === 'completed' && failedCount === 0

  const copyBarTransitions = useTransition(visible, {
    from: { opacity: 0, y: 12 },
    enter: { opacity: 1, y: 0 },
    leave: { opacity: 0, y: 12 },
    config: SPRING_SNAPPY,
    immediate: reducedMotion,
  })

  const handleStartClick = () => {
    if (conflict === 'overwrite' && preview && preview.conflicts > 0) {
      setConfirmOverwrite(true)
      return
    }
    void handleStart()
  }

  return (
    <>
      {copyBarTransitions((barStyle, show) =>
        show ? (
          <AnimatedBox
            position="sticky"
            bottom="3"
            className="sticky-copy-bar"
            style={{
              opacity: barStyle.opacity,
              transform: barStyle.y.to((v) =>
                v === 0 ? 'none' : `translate3d(0, ${v}px, 0)`,
              ),
            }}
          >
            <Card size="2" className="app-card sticky-copy-card">
              <Flex direction="column" gap="3" p="4">
                {!copyRunning && !copyPaused ? (
                  <>
                    <Flex align="center" gap="2" minWidth="0">
                      <Box flexGrow="1" minWidth="0">
                        <TextField.Root
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
                            variant="outline"
                            color="gray"
                            type="button"
                            onClick={() => void handleReveal()}
                            title="在文件资源管理器中打开目标目录"
                          >
                            <ExternalLink size={14} strokeWidth={1.75} />
                            打开
                          </Button>
                        </Box>
                      ) : null}

                      <Box flexShrink="0">
                        <Button
                          type="button"
                          disabled={!canCopy || copyBusy}
                          onClick={handleStartClick}
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

                        <Collapse
                          open={showFailures && copyTask.failures.length > 0}
                          unmountOnExit
                        >
                          <Box
                            maxHeight="160px"
                            width="100%"
                            overflow="hidden"
                            className="copy-failure-list"
                          >
                            <ScrollArea type="auto" scrollbars="vertical">
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
                        </Collapse>
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

                    <Progress value={copyPercent} />

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
                            onClick={() => void handleResume()}
                          >
                            <Play size={13} strokeWidth={1.75} /> 继续
                          </Button>
                        ) : (
                          <Button
                            size="1"
                            variant="soft"
                            onClick={() => void handlePause()}
                          >
                            <Pause size={13} strokeWidth={1.75} /> 暂停
                          </Button>
                        )}
                        <Button
                          size="1"
                          variant="outline"
                          color="red"
                          onClick={() => void handleCancel()}
                        >
                          <Square size={13} strokeWidth={1.75} /> 取消
                        </Button>
                      </Flex>
                    </Flex>
                  </Flex>
                )}
              </Flex>
            </Card>
          </AnimatedBox>
        ) : null,
      )}

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
    </>
  )
}
