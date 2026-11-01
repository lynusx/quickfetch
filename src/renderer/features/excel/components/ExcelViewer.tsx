import { useEffect, useRef } from 'react'
import {
  ClipboardCopyIcon,
  Cross2Icon,
  DownloadIcon,
  ExclamationTriangleIcon,
  TableIcon,
} from '@radix-ui/react-icons'
import {
  Badge,
  Box,
  Button,
  Callout,
  Flex,
  Grid,
  IconButton,
  Spinner,
  Text,
} from '@radix-ui/themes'

import { EmptyState } from '@/components/EmptyState'
import { Panel, PanelBody, PanelHeader } from '@/components/Panel'
import SheetFilterPanel from './SheetFilterPanel'
import SheetTablePreview from './SheetTablePreview'
import { useExcelViewer } from '../hooks/useExcelViewer'
import { useExcelStore } from '../stores/excelStore'
import { useSheetFilterStore } from '../stores/sheetFilterStore'

import type { ExcelFile } from '../types'

const FileMeta = ({ file }: { file: ExcelFile }) => (
  <Grid className="file-meta" columns="3" gap="2">
    <Box className="file-meta-item">
      <Text as="span" size="1" color="gray" className="file-meta-label">
        文件大小
      </Text>
      <Text as="span" className="file-meta-value">
        {file.size}
      </Text>
    </Box>
    <Box className="file-meta-item">
      <Text as="span" size="1" color="gray" className="file-meta-label">
        工作表
      </Text>
      <Text as="span" className="file-meta-value">
        {file.sheets.length} 个
      </Text>
    </Box>
    <Box className="file-meta-item">
      <Text as="span" size="1" color="gray" className="file-meta-label">
        上传时间
      </Text>
      <Text as="span" className="file-meta-value">
        {file.uploadTime}
      </Text>
    </Box>
  </Grid>
)

const STATUS_BADGE: Record<
  string,
  {
    label: string
    color: 'green' | 'blue' | 'red' | 'gray'
    variant: 'soft' | 'surface'
  }
> = {
  completed: { label: '解析完成', color: 'green', variant: 'soft' },
  processing: { label: '处理中', color: 'blue', variant: 'soft' },
  error: { label: '解析失败', color: 'red', variant: 'soft' },
}

const ExcelViewer = () => {
  const { file, sheet, setFile } = useExcelStore()
  const {
    generateSheetDate,
    handleCopyToClipboard,
    handleExportToExcel,
    isCopy,
    isExport,
  } = useExcelViewer()

  /**
   * 只在「文件或筛选条件变了」时重算预览。
   *
   * generateSheetDate 由内联函数组合而成，每次渲染身份都会变；直接把它
   * 放进依赖会让 effect 每轮都跑，而它内部又会 setSheet，形成无限更新。
   * 这里用 ref 持有最新实现，依赖只保留真正影响结果的数据。
   */
  const selectedLines = useSheetFilterStore((state) => state.selectedLines)
  const selectedDefects = useSheetFilterStore((state) => state.selectedDefects)
  const lineCount = useSheetFilterStore((state) => state.lines.size)
  const defectCount = useSheetFilterStore((state) => state.defects.size)
  const generateRef = useRef(generateSheetDate)
  useEffect(() => {
    generateRef.current = generateSheetDate
  })

  useEffect(() => {
    generateRef.current()
  }, [file, lineCount, defectCount, selectedLines, selectedDefects])

  if (!file) return null

  const statusMeta = STATUS_BADGE[file.status] || {
    label: '未知状态',
    color: 'gray',
    variant: 'surface',
  }

  if (file.status === 'error') {
    return (
      <Panel>
        <PanelHeader
          icon={<TableIcon width={13} height={13} />}
          title={file.name}
          description="文件解析失败"
          actions={
            <Badge color="red" variant="soft">
              错误
            </Badge>
          }
        />
        <PanelBody>
          <Flex direction="column" gap="4">
            <Callout.Root color="red" role="alert">
              <Callout.Icon>
                <ExclamationTriangleIcon width={16} height={16} />
              </Callout.Icon>
              <Callout.Text>
                <Text weight="medium">{file.name}</Text>：
                {file.error?.message || '未知错误'}
              </Callout.Text>
            </Callout.Root>

            <FileMeta file={file} />

            <Flex justify="end">
              <Button
                variant="soft"
                color="gray"
                size="2"
                onClick={() => setFile(null)}
              >
                <Cross2Icon width={14} height={14} />
                清除文件
              </Button>
            </Flex>
          </Flex>
        </PanelBody>
      </Panel>
    )
  }

  return (
    <Flex direction="column" gap="5">
      {/* 文件信息 */}
      <Panel>
        <PanelHeader
          icon={<TableIcon width={13} height={13} />}
          title={file.name}
          description="单文件解析，默认读取第 1 个工作表"
          actions={
            <>
              <Badge color={statusMeta.color} variant={statusMeta.variant}>
                {statusMeta.label}
              </Badge>
              <IconButton
                variant="ghost"
                color="gray"
                size="1"
                aria-label="清除文件"
                onClick={() => setFile(null)}
              >
                <Cross2Icon width={14} height={14} />
              </IconButton>
            </>
          }
        />
        <PanelBody>
          <FileMeta file={file} />
        </PanelBody>
      </Panel>

      {file.status === 'processing' ? (
        <Panel>
          <PanelBody>
            <Flex
              direction="column"
              align="center"
              justify="center"
              gap="2"
              py="6"
            >
              <Spinner size="2" />
              <Text weight="medium" size="2">
                正在解析 Excel 文件…
              </Text>
              <Text size="1" color="gray">
                请稍候，正在读取工作表数据
              </Text>
            </Flex>
          </PanelBody>
        </Panel>
      ) : null}

      {file.status === 'completed' ? (
        <Grid className="workbench-grid">
          {/* 左侧筛选 */}
          <Panel className="sticky-panel">
            <PanelHeader
              icon={<TableIcon width={13} height={13} />}
              title="筛选条件"
              description="线别与不良项可组合筛选，留空表示不过滤"
            />
            <PanelBody>
              <SheetFilterPanel />
            </PanelBody>
          </Panel>

          {/* 右侧数据预览 */}
          <Panel className="panel-fill">
            <PanelHeader
              icon={<TableIcon width={13} height={13} />}
              title={sheet?.name || '数据预览'}
              description={
                sheet
                  ? `${sheet.rowCount} 行 × ${sheet.colCount} 列`
                  : '调整左侧筛选条件后查看结果'
              }
              actions={
                <>
                  <Button
                    variant="soft"
                    color="gray"
                    size="1"
                    disabled={!sheet || isCopy}
                    onClick={() => sheet && handleCopyToClipboard(sheet)}
                  >
                    <ClipboardCopyIcon width={14} height={14} />
                    {isCopy ? '已复制' : '复制'}
                  </Button>
                  <Button
                    variant="soft"
                    color="gray"
                    size="1"
                    disabled={!sheet || isExport}
                    onClick={() => sheet && handleExportToExcel(sheet)}
                  >
                    {isExport ? (
                      <Spinner size="1" />
                    ) : (
                      <DownloadIcon width={14} height={14} />
                    )}
                    {isExport ? '导出中…' : '导出 Excel'}
                  </Button>
                </>
              }
            />
            <PanelBody>
              <Box className="table-shell">
                {sheet ? (
                  <SheetTablePreview sheet={sheet} mode="result" />
                ) : (
                  <EmptyState
                    icon={<TableIcon width={18} height={18} />}
                    title="暂无可显示的数据"
                    description="调整左侧筛选条件后再试。"
                  />
                )}
              </Box>
            </PanelBody>
          </Panel>
        </Grid>
      ) : null}
    </Flex>
  )
}

export default ExcelViewer
