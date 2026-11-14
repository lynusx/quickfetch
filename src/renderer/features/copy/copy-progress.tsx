import { CheckCircledIcon } from '@radix-ui/react-icons'
import {
  Badge,
  Box,
  Button,
  Flex,
  Progress,
  ScrollArea,
  Spinner,
  Text,
} from '@radix-ui/themes'

import type { CopyStatus, CopyTask } from '@shared/ipc'
import {
  formatClockTime,
  formatDuration,
  formatEta,
  formatFileSize,
} from '@/utils/common'
import './copy-progress.css'

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

interface CopyProgressProps {
  task: CopyTask
  percent: number
  /** 已完成项，由 copy read model 统一计算 */
  done: number
  showFailures: boolean
  onToggleFailures: () => void
}

/**
 * 复制进度展示。
 *
 * 四个扫描页共用同一个 CopyPanel，因此这里统一了所有页面的进度信息：
 * 已用/总耗时、剩余时间、预计完成时刻、已复制/总大小、实时网速。
 * 缺数据时给「计算中 / 未知」占位，而不是整行消失（现场会误以为功能没做）。
 */
const CopyProgress = ({
  task,
  percent,
  done,
  showFailures,
  onToggleFailures,
}: CopyProgressProps) => {
  const { progress } = task
  const meta = STATUS_META[task.status]
  const running = task.status === 'running' || task.status === 'pending'
  const paused = task.status === 'paused'
  const finished = !running && !paused

  const eta = running ? formatEta(progress.etaMs) : null
  /**
   * 预计完成时刻 = 开始时刻 + 已用 + 累计暂停 + 剩余。
   *
   * elapsedMs 扣掉了暂停时长，必须把 pausedMs 加回去，否则暂停过一次
   * 之后推算出来的时刻会比实际早一截。不用 Date.now()：渲染期间不允许
   * 调用非纯函数，快照本身每秒刷新一次，按快照推算足够准。
   */
  const finishAt =
    running && progress.etaMs !== null && progress.startedAt !== null
      ? progress.startedAt +
        progress.elapsedMs +
        progress.pausedMs +
        progress.etaMs
      : null
  const speed = progress.bytesPerSecond

  // 取消后只留摘要，不把进度条冻在 13% 让人以为还在跑
  if (task.status === 'canceled') {
    return (
      <Flex
        className="copy-canceled"
        align="center"
        gap="2"
        wrap="wrap"
        py="2"
        px="3"
      >
        <Badge color="gray" variant="surface">
          已取消
        </Badge>
        <Text size="1" color="gray">
          已复制 {progress.copied} / {progress.copyTotal} 张
          {progress.alreadyExists > 0
            ? ` · 已存在 ${progress.alreadyExists}`
            : ''}
          {progress.failed > 0 ? ` · 失败 ${progress.failed}` : ''}
          {` · 已用 ${formatDuration(progress.elapsedMs)}`}
          {progress.copiedBytes > 0
            ? ` · ${formatFileSize(progress.copiedBytes)}`
            : ''}
        </Text>
      </Flex>
    )
  }

  return (
    <Box className="copy-progress" p="3">
      <Flex direction="column" gap="2">
        <Flex justify="between" align="center">
          <Flex align="center" gap="2">
            <Badge color={meta.color} variant={meta.variant}>
              {meta.label}
            </Badge>
            {progress.batchTotal > 1 ? (
              <Text size="1" color="gray" className="tabular">
                第 {progress.batchIndex}/{progress.batchTotal} 批
              </Text>
            ) : null}
          </Flex>
          <Text size="1" color="gray" className="tabular">
            {progress.alreadyExists > 0 || progress.skipped > 0
              ? `已完成 ${done} / ${progress.total} 张`
              : `${progress.copied} / ${progress.total} 张`}
            {progress.alreadyExists > 0
              ? ` · 已存在 ${progress.alreadyExists}`
              : ''}
            {progress.skipped > 0 ? ` · 重名跳过 ${progress.skipped}` : ''}
            {progress.failed > 0 ? ` · 失败 ${progress.failed}` : ''}
            {progress.renamed > 0 ? ` · 改名 ${progress.renamed}` : ''}
          </Text>
        </Flex>

        <Flex align="baseline" justify="between" gap="3" mb="2">
          <Flex align="center" gap="2">
            {running ? <Spinner size="1" /> : null}
            <Text size="1" weight="medium" className="copy-progress-label">
              完成进度
            </Text>
          </Flex>
          <Text size="3" weight="bold" className="copy-progress-value">
            {percent}%
          </Text>
        </Flex>

        <Progress value={percent} size="2" />

        <Flex className="copy-progress-meta" wrap="wrap" mt="2">
          <Text size="1" color="gray">
            {finished ? '总耗时' : '已用'} {formatDuration(progress.elapsedMs)}
          </Text>

          {finished ? (
            progress.finishedAt !== null ? (
              <Text size="1" color="gray">
                {task.status === 'completed' ? '完成于' : '结束于'}{' '}
                {formatClockTime(progress.finishedAt)}
              </Text>
            ) : null
          ) : paused ? (
            <Text size="1" color="amber">
              剩余 已暂停
            </Text>
          ) : (
            <>
              <Text size="1" color="gray">
                {eta ? `剩余 ${eta}` : '剩余 计算中'}
              </Text>
              <Text size="1" color="gray">
                {finishAt !== null
                  ? `预计 ${formatClockTime(finishAt)} 完成`
                  : '预计完成 计算中'}
              </Text>
            </>
          )}

          <Text size="1" color="gray" className="tabular">
            {formatFileSize(progress.copiedBytes)} /{' '}
            {progress.totalBytes > 0
              ? formatFileSize(progress.totalBytes)
              : '大小未知'}
            {progress.sizeUnknown > 0
              ? ` · ${progress.sizeUnknown} 个大小未知`
              : ''}
          </Text>

          {speed > 0 ? (
            <Text size="1" color="gray" className="tabular">
              {running ? '实时网速' : '平均网速'} {formatFileSize(speed)}/s
            </Text>
          ) : running ? (
            <Text size="1" color="gray">
              实时网速 计算中
            </Text>
          ) : null}

          <Text
            size="1"
            color="gray"
            truncate
            className="mono copy-progress-path"
            title={progress.currentPath}
          >
            {progress.currentPath}
          </Text>
        </Flex>

        {task.status === 'completed' && progress.targetDir ? (
          <Flex align="center" gap="1">
            <CheckCircledIcon width={14} height={14} className="success-icon" />
            <Text size="1" color="gray">
              已写入{' '}
              <Text className="mono" title={progress.targetDir}>
                {progress.targetDir}
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
              onClick={onToggleFailures}
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
                    <Text size="1" color="red" truncate title={failure.reason}>
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
  )
}

export default CopyProgress
