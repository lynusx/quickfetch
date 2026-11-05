import type { ReactNode } from 'react'
import {
  DownloadIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
} from '@radix-ui/react-icons'
import { Box, Callout, Flex, Grid, Strong } from '@radix-ui/themes'

import { CopyPanel } from '@/features/copy'
import { HistoryPanel } from '@/features/history'
import { PageHeader } from '@/components/page-header/page-header'
import { Panel, PanelBody, PanelHeader } from '@/components/panel'
import { ScanStatusBadge } from './scan-status-badge'
import { ScanTaskPanel } from './scan-task-panel'
import { useScanSession } from '../hooks/useScanSession'
import { useToast } from '@/hooks/useToast'
import type { ScanCategory, ScanTaskParams } from '@shared/ipc'
import '../scan.css'

const EYEBROW: Record<ScanCategory, string> = {
  el: '找图 · EL',
  lxt: '找图 · 力禧特EL',
  pl: '找图 · 利珀PL',
  aoi: '找图 · 森标 AOI',
}

interface PlantScanPageProps {
  category: ScanCategory
  title: string
  /** EL 与入口类页面的说明不同；不传时用入口类默认文案 */
  description?: string
  unconfigured: { title: string; description: string }
  networkHint: string
  configured: boolean
  /** 入口类页面传机台数；EL 没有入口概念，不传就不显示那条提示 */
  activeMachines?: number
  ready: boolean
  missing?: string[]
  getParams: () => Omit<ScanTaskParams, 'category'>
  /**
   * 当前扫描范围的指纹。任一项变化就收起上一轮的结果，
   * 避免"切了日期，右边还挂着上一次的结论"。
   */
  filterSignature: string
  picker: ReactNode
  filterPanel: ReactNode
}

const PlantScanPage = ({
  category,
  title,
  description = '按入口目录中的快捷方式识别机台，按日期、班次与类型收集图片，并批量复制到本地。',
  unconfigured,
  networkHint,
  configured,
  activeMachines,
  ready,
  missing,
  getParams,
  filterSignature,
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
  } = useScanSession({ category, showToast, getParams, filterSignature })

  const canStart = ready && !busy && !creating && !other

  return (
    <Box>
      <PageHeader
        eyebrow={EYEBROW[category]}
        title={title}
        description={description}
        badge={task ? <ScanStatusBadge status={task.status} /> : null}
      />

      <Grid className="workbench-grid">
        <Panel>
          <PanelHeader
            icon={<MagnifyingGlassIcon width={13} height={13} />}
            title="扫描范围"
            description="按顺序选好入口目录、机台、时间与类型"
          />
          <PanelBody>
            {picker}
            <Box className="panel-section">{filterPanel}</Box>
          </PanelBody>
        </Panel>

        <Flex className="panel-stack" direction="column">
          <ScanTaskPanel
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
            notices={
              <>
                {!configured ? (
                  <Callout.Root color="amber" size="1">
                    <Callout.Icon>
                      <ExclamationTriangleIcon width={14} height={14} />
                    </Callout.Icon>
                    <Callout.Text>
                      <Strong>{unconfigured.title}：</Strong>
                      {unconfigured.description}
                    </Callout.Text>
                  </Callout.Root>
                ) : null}

                {activeMachines !== undefined &&
                configured &&
                !activeMachines ? (
                  <Callout.Root color="amber" size="1">
                    <Callout.Icon>
                      <ExclamationTriangleIcon width={14} height={14} />
                    </Callout.Icon>
                    <Callout.Text>
                      <Strong>入口里没有可用机台：</Strong>
                      请确认快捷方式的目标是网络路径（\\主机），本地路径会被跳过
                    </Callout.Text>
                  </Callout.Root>
                ) : null}
              </>
            }
            onStart={() => void start()}
            onPause={() => void pause()}
            onResume={() => void resume()}
            onCancel={() => void cancel()}
            onClear={clearResult}
          />

          <Panel>
            <PanelHeader
              icon={<DownloadIcon width={13} height={13} />}
              title="复制到本地"
              description="按机台勾选，平铺或分组写入目标目录"
            />
            <PanelBody>
              <CopyPanel category={category} showToast={showToast} />
            </PanelBody>
          </Panel>

          <HistoryPanel
            category={category}
            onRestore={(item) => void restoreHistory(item)}
            showToast={showToast}
            activeId={task?.id ?? null}
            activeStatus={task?.status ?? null}
          />
        </Flex>
      </Grid>
    </Box>
  )
}

export default PlantScanPage
