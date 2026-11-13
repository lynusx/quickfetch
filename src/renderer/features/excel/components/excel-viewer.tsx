import { useEffect } from 'react'
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

import { EmptyState } from '@/components/empty-state/empty-state'
import { Panel, PanelBody, PanelHeader } from '@/components/panel'
import SheetFilterPanel from './sheet-filter-panel'
import SheetTablePreview from './sheet-table-preview'
import { useExcelViewer } from '../hooks/useExcelViewer'
import { useExcelStore } from '../stores/excelStore'

import type { ExcelFile } from '../types'

const FileMeta = ({ file }: { file: ExcelFile }) => (
  <Grid className="file-meta" columns="3" gap="2">
    <Flex className="file-meta-item" direction="column" gap="1" py="2" px="3">
      <Text as="div" size="1" color="gray" className="file-meta-label">
        文件大小
      </Text>
      <Text as="div" size="1" weight="medium" truncate className="tabular">
        {file.size}
      </Text>
    </Flex>
    <Flex className="file-meta-item" direction="column" gap="1" py="2" px="3">
      <Text as="div" size="1" color="gray" className="file-meta-label">
        工作表
      </Text>
      <Text as="div" size="1" weight="medium" truncate className="tabular">
        {file.sheets.length} 个
      </Text>
    </Flex>
    <Flex className="file-meta-item" direction="column" gap="1" py="2" px="3">
      <Text as="div" size="1" color="gray" className="file-meta-label">
        上传时间
      </Text>
      <Text as="div" size="1" weight="medium" truncate className="tabular">
        {file.uploadTime}
      </Text>
    </Flex>
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
   * generateSheetDate 现在由 useCallback 记忆化，身份稳定；依赖可以直接
   * 用回调本身，不再需要用 ref 绕开每次渲染新建的内联函数。
   */
  useEffect(() => {
    generateSheetDate()
  }, [generateSheetDate])

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
              <Button variant="soft" color="gray" onClick={() => setFile(null)}>
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
        <Grid className="workbench-grid" gap="4" align="start">
          {/* 左侧筛选 */}
          <Panel>
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
