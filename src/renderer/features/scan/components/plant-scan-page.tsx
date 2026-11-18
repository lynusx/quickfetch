import type { ReactNode } from 'react'
import { MagnifyingGlassIcon } from '@radix-ui/react-icons'
import { Box, Flex, Grid } from '@radix-ui/themes'

import { HistoryPanel } from '@/features/history'
import { PageShell } from '@/components/page-shell/page-shell'
import { Panel, PanelBody, PanelHeader } from '@/components/panel'
import { ScanEntryRootBar } from './scan-entry-root-bar'
import { ScanStatusBadge } from './scan-status-badge'
import { ScanTaskPanel } from './scan-task-panel'
import { useScanSession } from '../hooks/useScanSession'
import { useToast } from '@/hooks/useToast'
import type { ScanCategory, ScanTaskParams } from '@shared/ipc'
import { SCAN_CATEGORY_LABEL } from '@shared/scanCategories'
import '../scan.css'

interface PlantScanPageProps {
  category: ScanCategory
  /** EL 与入口类页面的说明不同；不传时用入口类默认文案 */
  description?: string
  networkHint: string
  /** 页面自己的提示条（未配置入口、入口没有机台）；不传就不占位 */
  notices?: ReactNode
  ready: boolean
  missing?: string[]
  getParams: () => Omit<ScanTaskParams, 'category'>
  /**
   * 当前扫描范围的指纹。任一项变化就收起上一轮的结果，
   * 避免"切了日期，右边还挂着上一次的结论"。
   */
  filterSignature: string
  /** 按 store 当前状态重算指纹；历史恢复后用它推进基线 */
  getSignature: () => string
  picker: ReactNode
  filterPanel: ReactNode
}

const PlantScanPage = ({
  category,
  description = '按入口目录中的快捷方式识别机台，按日期、班次与类型收集图片，并批量复制到本地。',
  networkHint,
  notices,
  ready,
  missing,
  getParams,
  filterSignature,
  getSignature,
  picker,
  filterPanel,
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

  const canStart = ready && !busy && !creating && !other

  return (
    <PageShell
      title={SCAN_CATEGORY_LABEL[category]}
      description={description}
      badge={task ? <ScanStatusBadge status={task.status} /> : null}
      actions={
        <ScanEntryRootBar category={category} disabled={busy || creating} />
      }
    >
      <Flex direction="column" gap="4">
        <Panel>
          <PanelHeader
            icon={<MagnifyingGlassIcon width={13} height={13} />}
            title="扫描范围"
          />
          <PanelBody>
            <Grid
              columns={{
                initial: '1',
                md: 'minmax(280px, 1.1fr) minmax(440px, 2fr)',
              }}
              gap="5"
              align="start"
            >
              <Box minWidth="0">{picker}</Box>
              <Box minWidth="0">{filterPanel}</Box>
            </Grid>
          </PanelBody>
        </Panel>

        <ScanTaskPanel
          category={category}
          task={task}
          creating={creating}
          busy={busy}
          ready={ready}
          missing={missing}
          canStart={canStart}
          error={error}
          other={other}
          otherLabel={otherLabel}
          networkHint={networkHint}
          notices={notices}
          showToast={showToast}
          onStart={() => void start()}
          onPause={() => void pause()}
          onResume={() => void resume()}
          onCancel={() => void cancel()}
          onClear={clearResult}
        />

        <HistoryPanel
          category={category}
          onRestore={(item) => void restoreHistory(item)}
          showToast={showToast}
          activeId={task?.id ?? null}
          activeStatus={task?.status ?? null}
        />
      </Flex>
    </PageShell>
  )
}

export default PlantScanPage
