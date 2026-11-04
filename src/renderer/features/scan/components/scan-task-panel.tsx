import type { ReactNode } from 'react'
import {
  ActivityLogIcon,
  ExclamationTriangleIcon,
  InfoCircledIcon,
  MagicWandIcon,
  PauseIcon,
  PlayIcon,
  ResetIcon,
  StopIcon,
} from '@radix-ui/react-icons'
import {
  Box,
  Button,
  Callout,
  Flex,
  Grid,
  Progress,
  Spinner,
  Strong,
  Text,
} from '@radix-ui/themes'

import { Panel, PanelBody, PanelHeader } from '@/components/panel'
import { Stat, StatGrid } from '@/components/stat'
import type { ScanTask } from '@shared/ipc'
import { formatDuration, formatEta } from '@/utils/common'
import {
  SCAN_STATUS_META,
  branchState,
  branchSummary,
  inaccessibleKindOf,
} from './scanStatus'
import { ScanStatusBadge } from './scan-status-badge'

const PHASE_LABEL: Record<string, string> = {
  probe: '探测目录',
  collect: '收集图片',
  done: '已结束',
}

const DOT_TONE: Record<string, string> = {
  success: 'success',
  danger: 'danger',
  warn: 'warn',
  muted: '',
}

interface ScanTaskPanelProps {
  task: ScanTask | null
  creating: boolean
  busy: boolean
  ready: boolean
  /** 还没选齐的项，例如「机台、时段、类型」 */
  missing?: string[]
  canStart: boolean
  error?: string | null
  /** 页面特有的提示（未配置入口、入口无机台等） */
  notices?: ReactNode
  /** 另一类扫描正在进行的提示 */
  other?: ScanTask | null
  otherLabel?: string | null
  networkHint: string
  onStart: () => void
  onPause: () => void
  onResume: () => void
  onCancel: () => void
  onClear: () => void
}

/**
 * 扫描任务的公共面板。
 *
 * 各类扫描的进度、统计、控制按钮与机台结果完全同构，抽出来是为了
 * 让「状态灯、按钮顺序、统计口径」只维护一份，不会改了一页漏一页。
 */
export const ScanTaskPanel = ({
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
  onStart,
  onPause,
  onResume,
  onCancel,
  onClear,
}: ScanTaskPanelProps) => {
  const status = task ? SCAN_STATUS_META[task.status] : null
  const branches = task?.branches ?? []

  const abnormal = branches.filter(
    (branch) => branch.status !== 'hit' && branch.status !== 'empty',
  )
  // 按「下一步该做什么」分类统计。以前只统计 unreachableReason === 'network'，
  // 现场 23 台失败只显示「不可达 3 台」，剩下 20 台去哪了没人知道。
  const inaccessible = branches.reduce(
    (acc, branch) => {
      const kind = inaccessibleKindOf(branch)
      if (kind) acc[kind] += 1
      return acc
    },
    { network: 0, auth: 0, denied: 0 },
  )
  const hasInaccessible =
    inaccessible.network + inaccessible.auth + inaccessible.denied > 0
  const eta =
    task && task.status === 'running' ? formatEta(task.progress.etaMs) : null
  const runningPending = task?.progress.machinesPending ?? 0

  const phaseDescription = task
    ? task.status === 'interrupted'
      ? '上次退出时保存，可按原参数重新扫描'
      : task.progress.phase === 'done'
        ? status?.label
        : PHASE_LABEL[task.progress.phase]
    : '尚未开始扫描'

  return (
    <Panel>
      <PanelHeader
        icon={<ActivityLogIcon width={13} height={13} />}
        title="扫描任务"
        description={phaseDescription}
        actions={
          <>
            {task ? <ScanStatusBadge status={task.status} size="1" /> : null}
            {task && !busy ? (
              <Button size="1" variant="ghost" color="gray" onClick={onClear}>
                <ResetIcon width={13} height={13} />
                清除结果
              </Button>
            ) : null}
          </>
        }
      />

      <PanelBody>
        <Flex direction="column" gap="4">
          <StatGrid>
            <Stat
              label="命中图片"
              value={task?.totalImages ?? 0}
              unit="张"
              tone="accent"
            />
            <Stat
              label="已读目录"
              value={task?.progress.dirsScanned ?? 0}
              unit="个"
            />
            <Stat
              label="跳过目录"
              value={task?.progress.dirsSkipped ?? 0}
              unit="个"
            />
            <Stat
              label="用时"
              value={task ? formatDuration(task.elapsedMs) : '—'}
            />
          </StatGrid>

          <Box>
            <Flex
              className="progress-head"
              align="baseline"
              justify="between"
              gap="3"
            >
              <Flex align="center" gap="2">
                {task?.status === 'running' || task?.status === 'pending' ? (
                  <Spinner size="1" />
                ) : null}
                <Text
                  as="span"
                  size="1"
                  color="gray"
                  className="progress-label"
                >
                  完成进度
                </Text>
              </Flex>
              <Text as="span" className="progress-value">
                {task?.progress.percent ?? 0}%
              </Text>
            </Flex>
            <Progress value={task?.progress.percent ?? 0} size="2" />

            <Flex className="progress-meta" wrap="wrap" gap="2">
              {task && task.progress.batchTotal > 0 ? (
                <Text as="span" size="1" color="gray">
                  第 {task.progress.batchIndex}/{task.progress.batchTotal} 批
                </Text>
              ) : null}
              {task && task.progress.concurrency > 0 ? (
                <Text as="span" size="1" color="gray">
                  并发 {task.progress.concurrency}
                </Text>
              ) : null}
              {task && task.progress.detailsPending > 0 ? (
                <Text as="span" size="1" color="gray">
                  待读明细 {task.progress.detailsPending}
                </Text>
              ) : null}
              {/*
                还剩几台没下结论。现场看到进度停在 70% 又显示"收集图片"，
                分不清是卡住还是快好了，加这个数字就能判断。
                运行态才显示：暂停时最想知道的是"还差多少"，已完成则没必要。
              */}
              {task && task.status === 'running' && runningPending > 0 ? (
                <Text as="span" size="1" color="amber">
                  正在等 {runningPending} 台机台
                </Text>
              ) : null}
              {eta ? (
                <Text as="span" size="1" color="gray">
                  剩余 {eta}
                </Text>
              ) : null}
              {hasInaccessible ? (
                <Flex as="span" align="center" gap="2" wrap="wrap">
                  {inaccessible.network > 0 ? (
                    <Text as="span" size="1" color="red">
                      不可达 {inaccessible.network} 台
                    </Text>
                  ) : null}
                  {inaccessible.auth > 0 ? (
                    <Text as="span" size="1" color="amber">
                      未认证 {inaccessible.auth} 台
                    </Text>
                  ) : null}
                  {inaccessible.denied > 0 ? (
                    <Text as="span" size="1" color="amber">
                      无权限 {inaccessible.denied} 台
                    </Text>
                  ) : null}
                </Flex>
              ) : null}
            </Flex>

            {task?.progress.currentPath ? (
              <Flex
                className="path-strip"
                align="center"
                gap="2"
                title={task.progress.currentPath}
              >
                <Text as="span" size="1" color="gray">
                  {task.progress.currentPath}
                </Text>
              </Flex>
            ) : null}
          </Box>

          <Flex className="action-bar" wrap="wrap" align="center" gap="2">
            {!busy ? (
              <Button
                size="2"
                variant="solid"
                onClick={onStart}
                disabled={!canStart}
              >
                {creating ? (
                  <Spinner size="1" />
                ) : (
                  <MagicWandIcon width={15} height={15} />
                )}
                {task ? '重新扫描' : '开始扫描'}
              </Button>
            ) : (
              <>
                {task?.status === 'paused' ? (
                  <Button size="2" onClick={onResume}>
                    <PlayIcon width={15} height={15} />
                    继续
                  </Button>
                ) : (
                  <Button
                    size="2"
                    variant="outline"
                    onClick={onPause}
                    disabled={task?.status !== 'running'}
                  >
                    <PauseIcon width={15} height={15} />
                    暂停
                  </Button>
                )}
                <Button size="2" variant="outline" onClick={onCancel}>
                  <StopIcon width={15} height={15} />
                  取消
                </Button>
              </>
            )}
          </Flex>

          {!ready && !busy && missing?.length ? (
            <Flex className="inline-hint" align="start" gap="2">
              <InfoCircledIcon width={13} height={13} />
              <Text as="span" size="1" color="gray">
                还需要选择{missing.join('、')}，选齐后才能开始扫描
              </Text>
            </Flex>
          ) : null}

          {(other ||
            notices ||
            (error ?? task?.error) ||
            task?.status === 'paused' ||
            (task?.status === 'completed' && task.totalImages === 0)) && (
            <Flex className="callout-stack" direction="column" gap="2">
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
                    请检查机台、日期、班次与类型；各机台结果里保留了断链原因。
                  </Callout.Text>
                </Callout.Root>
              ) : null}

              {task?.status === 'paused' && task.pauseReason === 'network' ? (
                <Callout.Root color="red" size="1">
                  <Callout.Icon>
                    <ExclamationTriangleIcon width={14} height={14} />
                  </Callout.Icon>
                  <Callout.Text>
                    <Strong>机台不可达，任务已暂停：</Strong> {networkHint}
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

          {task && task.status !== 'pending' ? (
            <Box className="panel-section">
              <Flex
                className="panel-section-title"
                align="center"
                justify="between"
                gap="3"
              >
                <Text as="span" size="1" weight="medium">
                  各机台结果
                </Text>
                <Text as="span" size="1" color="gray" className="field-count">
                  {formatDuration(task.elapsedMs)}
                  {abnormal.length > 0 && ` · ${abnormal.length} 台无结果`}
                </Text>
              </Flex>

              <Box className="data-list">
                <Grid className="data-list-head">
                  <Text as="span" size="1" color="gray" weight="medium">
                    机台
                  </Text>
                  <Text as="span" size="1" color="gray" weight="medium">
                    状态
                  </Text>
                  <Text
                    as="span"
                    size="1"
                    color="gray"
                    weight="medium"
                    align="right"
                  >
                    图片
                  </Text>
                </Grid>
                {branches.map((branch) => {
                  const tone = branchState(branch)
                  const kind = inaccessibleKindOf(branch)
                  const summary = branchSummary(branch, task?.params)

                  return (
                    <Grid
                      className="data-row"
                      key={branch.machine}
                      data-state={kind ?? undefined}
                    >
                      <Text
                        as="span"
                        size="1"
                        className="data-row-machine"
                        title={branch.machine}
                      >
                        {branch.machine}
                      </Text>
                      <Flex
                        as="span"
                        className="data-row-status"
                        align="center"
                        gap="1"
                        title={branch.detail ?? undefined}
                      >
                        <Box
                          as="span"
                          className="status-dot"
                          data-tone={DOT_TONE[tone] || undefined}
                        />
                        <Text as="span" size="1" className="data-row-message">
                          {summary.statusText}
                        </Text>
                      </Flex>
                      <Text
                        as="span"
                        size="1"
                        align="right"
                        weight="medium"
                        className="data-row-value"
                      >
                        {summary.imagesText}
                      </Text>
                    </Grid>
                  )
                })}
              </Box>
            </Box>
          ) : null}

          {!task ? (
            <Text size="1" color="gray">
              选好扫描范围后点击「开始扫描」，进度与各机台结果会实时显示在这里。
            </Text>
          ) : null}
        </Flex>
      </PanelBody>
    </Panel>
  )
}

export default ScanTaskPanel
