import { useCallback } from 'react'
import {
  DownloadIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
} from '@radix-ui/react-icons'
import { Box, Callout, Flex, Grid, Strong } from '@radix-ui/themes'

import { CopyPanel } from '@/features/copy'
import { HistoryPanel } from '@/features/history'
import { PageHeader } from '@/components/PageHeader'
import { Panel, PanelBody, PanelHeader } from '@/components/Panel'
import { ScanStatusBadge } from '../components/ScanStatusBadge'
import { ScanTaskPanel } from '../components/ScanTaskPanel'
import ImageFilterPanel from '../components/ImageFilterPanel'
import ScanSetupPanel from '../components/ScanSetupPanel'
import { useHistoryRestore } from '../hooks/useHistoryRestore'
import { useScanTask } from '../hooks/useScanTask'
import { useToast } from '@/hooks/useToast'
import { useImageFilterStore } from '../stores/imageFilterStore'
import { useElScanStore } from '../stores/scanStore'
import { useSettingsStore, useUserPreferencesStore } from '@/features/settings'
import { DEFAULT_HISTORY_LIMIT } from '@shared/historyLimit'
import '../scan.css'

const ImageCopyPage = () => {
  const { showToast } = useToast()

  const {
    task,
    creating,
    busy,
    other,
    otherLabel,
    start,
    pause,
    resume,
    cancel,
  } = useScanTask({
    category: 'el',
    showToast,
    getParams: () => {
      const filters = useImageFilterStore.getState()

      return {
        machines: filters.selectedMachines,
        date: filters.date,
        shift: filters.shift,
        slots: filters.slots,
        types: filters.types,
      }
    },
  })

  const settings = useSettingsStore((state) => state.settings)
  const saveHistoryLimit = useSettingsStore((state) => state.saveHistoryLimit)
  const scanError = useElScanStore((state) => state.error)
  const historyLimit = settings?.historyLimit ?? DEFAULT_HISTORY_LIMIT

  const restoreHistory = useHistoryRestore('el')

  const clearResult = useCallback(() => {
    useElScanStore.getState().setTask(null)
  }, [])

  const configured = Boolean(settings?.rootPath)

  const filters = useImageFilterStore()
  const ngTypes = useUserPreferencesStore((state) => state.ngTypes)
  const ready =
    filters.selectedMachines.length > 0 &&
    filters.slots.length > 0 &&
    filters.types.length > 0 &&
    Boolean(filters.date)
  const canStart = !busy && !creating && ready && !other && configured

  const missing = configured
    ? [
        filters.selectedMachines.length ? '' : '机台',
        filters.date ? '' : '日期',
        filters.slots.length ? '' : '时段',
        filters.types.length
          ? ''
          : ngTypes.length
            ? '类型'
            : '类型（点「编辑」添加）',
      ].filter(Boolean)
    : []

  return (
    <Box>
      <PageHeader
        eyebrow="一键找图 · EL"
        title="EL 图片批量拷贝"
        description="按日期、班次与类型从 DC 共享盘收集 EL 图片，支持暂停续跑，并把命中的图片批量复制到本地。"
        badge={task ? <ScanStatusBadge status={task.status} /> : null}
      />

      <Grid className="workbench-grid">
        <Panel>
          <PanelHeader
            icon={<MagnifyingGlassIcon width={13} height={13} />}
            title="扫描范围"
            description="按顺序选好根目录、机台、时间与类型"
          />
          <PanelBody>
            <ScanSetupPanel />
            <Box className="panel-section">
              <ImageFilterPanel />
            </Box>
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
            error={scanError}
            other={other}
            otherLabel={otherLabel}
            networkHint="恢复共享盘连接后点击「继续」，已扫描的结果不会丢失"
            notices={
              !configured ? (
                <Callout.Root color="amber" size="1">
                  <Callout.Icon>
                    <ExclamationTriangleIcon width={14} height={14} />
                  </Callout.Icon>
                  <Callout.Text>
                    <Strong>还没有配置 DC 根目录：</Strong>
                    在左侧填入或选择根目录后，才能开始扫描。
                  </Callout.Text>
                </Callout.Root>
              ) : null
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
              <CopyPanel category="el" showToast={showToast} />
            </PanelBody>
          </Panel>

          <HistoryPanel
            category="el"
            onRestore={(item) => void restoreHistory(item)}
            showToast={showToast}
            activeId={task?.id ?? null}
            activeStatus={task?.status ?? null}
            limit={historyLimit}
            onLimitChange={(limit) => void saveHistoryLimit(limit)}
          />
        </Flex>
      </Grid>
    </Box>
  )
}

export default ImageCopyPage
