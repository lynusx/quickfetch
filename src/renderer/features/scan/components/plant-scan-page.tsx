import type { ReactNode } from 'react'
import { useState } from 'react'
import { ChevronUp, Play, Search, TriangleAlert } from 'lucide-react'
import {
  Badge,
  Button,
  Callout,
  Flex,
  Separator,
  Spinner,
  Strong,
  Text,
} from '@radix-ui/themes'

import { HistoryPanel } from '@/features/history'
import { PageShell } from '@/components/page-shell/page-shell'
import { Panel, PanelBody, PanelHeader } from '@/components/panel'
import { ScanEntryRootBar, ScanEntrySetupCard } from './scan-entry-root-bar'
import { ScanStatusBadge } from './scan-status-badge'
import { ScanTaskPanel } from './scan-task-panel'
import { ScopeSummaryBar } from './scope-summary-bar'
import { useScanSession } from '../hooks/useScanSession'
import { useToast } from '@/hooks/useToast'
import type { ScanCategory, ScanHistoryItem, ScanTaskParams } from '@shared/ipc'
import { SCAN_CATEGORY_LABEL } from '@shared/scanCategories'
import '../scan.css'

interface PlantScanPageProps {
  category: ScanCategory
  configured: boolean
  hasMachines: boolean
  networkHint: string
  ready: boolean
  missing?: string[]
  getParams: () => Omit<ScanTaskParams, 'category'>
  /**
   * 当前扫描范围的指纹。任一项变化就收起上一轮的结果，
   * 避免"切了日期，下方还挂着上一次的结论"。
   */
  filterSignature: string
  /** 按 store 当前状态重算指纹；历史恢复后用它推进基线 */
  getSignature: () => string
  /** 扫描范围表单内容（按时间 → 厂区/机台 → 类型顺序排布） */
  scopeForm: ReactNode
}

const PlantScanPage = ({
  category,
  configured,
  hasMachines,
  networkHint,
  ready,
  missing,
  getParams,
  filterSignature,
  getSignature,
  scopeForm,
}: PlantScanPageProps) => {
  const { showToast } = useToast()

  const {
    task,
    creating,
    busy,
    other,
    otherLabel,
    error,
    start,
    pause,
    resume,
    cancel,
    restoreHistory,
    clearResult,
  } = useScanSession({
    category,
    showToast,
    getParams,
    filterSignature,
    getSignature,
  })

  const taskId = task?.id ?? null
  const [prevTaskId, setPrevTaskId] = useState<string | null>(taskId)
  const [scopeExpanded, setScopeExpanded] = useState<boolean>(taskId === null)

  if (taskId !== prevTaskId) {
    setPrevTaskId(taskId)
    setScopeExpanded(taskId === null)
  }

  const handleRestore = (item: ScanHistoryItem) => {
    setScopeExpanded(false)
    void restoreHistory(item)
  }

  const canStart = ready && !busy && !creating && !other
  const needsSetup = !configured || !hasMachines
  const showSetupCard = needsSetup && !task

  return (
    <PageShell
      title={SCAN_CATEGORY_LABEL[category]}
      contentMaxWidth="1040px"
      badge={task ? <ScanStatusBadge status={task.status} /> : null}
      actions={
        <>
          {!showSetupCard ? (
            <ScanEntryRootBar category={category} disabled={busy || creating} />
          ) : null}
          <HistoryPanel
            category={category}
            onRestore={handleRestore}
            showToast={showToast}
            activeId={task?.id ?? null}
            activeStatus={task?.status ?? null}
          />
        </>
      }
    >
      {showSetupCard ? (
        <ScanEntrySetupCard
          category={category}
          noMachines={configured && !hasMachines}
        />
      ) : (
        <Flex direction="column" gap="4">
          {/* 上半区：配置期展示展开态参数矩阵，执行/结果期折叠为单行摘要条 */}
          {scopeExpanded || !task ? (
            <Panel>
              <PanelHeader
                icon={<Search size={15} strokeWidth={1.75} />}
                title="扫描范围"
                actions={
                  <>
                    {busy ? (
                      <Badge color="blue" size="1">
                        扫描中 · 仅查看
                      </Badge>
                    ) : null}
                    {task ? (
                      <Button
                        type="button"
                        variant="soft"
                        color="gray"
                        onClick={() => setScopeExpanded(false)}
                      >
                        收起
                        <ChevronUp size={14} strokeWidth={1.75} />
                      </Button>
                    ) : null}
                  </>
                }
              />
              <PanelBody>
                <Flex direction="column" gap="4">
                  <Flex
                    direction="column"
                    gap="4"
                    className="scope-matrix-grid"
                    data-readonly={busy ? 'true' : undefined}
                    aria-disabled={busy || undefined}
                  >
                    {scopeForm}
                  </Flex>

                  {!task && other && otherLabel ? (
                    <Callout.Root color="blue" size="1">
                      <Callout.Icon>
                        <TriangleAlert size={14} strokeWidth={1.75} />
                      </Callout.Icon>
                      <Callout.Text>
                        <Strong>另一类扫描正在进行：</Strong> {otherLabel}
                      </Callout.Text>
                    </Callout.Root>
                  ) : null}

                  {!task && error ? (
                    <Callout.Root color="red" size="1">
                      <Callout.Icon>
                        <TriangleAlert size={14} strokeWidth={1.75} />
                      </Callout.Icon>
                      <Callout.Text>
                        <Strong>启动扫描失败：</Strong> {error}
                      </Callout.Text>
                    </Callout.Root>
                  ) : null}

                  {!busy ? (
                    <>
                      <Separator size="4" />
                      <Flex
                        align="center"
                        justify="between"
                        gap="3"
                        wrap="wrap"
                      >
                        <Text size="2" color="gray">
                          {!ready && missing?.length
                            ? `请先选择：${missing.join('、')}`
                            : '范围已就绪'}
                        </Text>
                        <Button
                          type="button"
                          size="2"
                          disabled={!canStart}
                          onClick={() => void start()}
                        >
                          {creating ? (
                            <Spinner size="1" />
                          ) : (
                            <Play size={14} strokeWidth={1.75} />
                          )}
                          {task ? '重新扫描' : '开始扫描'}
                        </Button>
                      </Flex>
                    </>
                  ) : null}
                </Flex>
              </PanelBody>
            </Panel>
          ) : (
            <ScopeSummaryBar
              category={category}
              busy={busy}
              onExpand={() => setScopeExpanded(true)}
            />
          )}

          {/* 下半区：仅在已有扫描任务时渲染单列任务流与吸底复制栏 */}
          {task ? (
            <ScanTaskPanel
              category={category}
              task={task}
              creating={creating}
              busy={busy}
              canStart={canStart}
              error={error}
              other={other}
              otherLabel={otherLabel}
              networkHint={networkHint}
              showToast={showToast}
              onStart={() => void start()}
              onPause={() => void pause()}
              onResume={() => void resume()}
              onCancel={() => void cancel()}
              onClear={clearResult}
            />
          ) : null}
        </Flex>
      )}
    </PageShell>
  )
}

export default PlantScanPage
