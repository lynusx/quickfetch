import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { ClipboardCopy, Download, Table2, TriangleAlert, X } from 'lucide-react'
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

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/empty'
import { Panel, PanelBody, PanelHeader } from '@/components/panel'
import SheetFilterPanel from './sheet-filter-panel'
import SheetTablePreview from './sheet-table-preview'
import { useExcelViewer } from '../hooks/useExcelViewer'
import { useExcelStore } from '../stores/excelStore'

import type { ExcelFile } from '../types'

const FileMetaItem = ({
  label,
  value,
}: {
  label: string
  value: ReactNode
}) => (
  <Flex className="file-meta-item" direction="column" gap="1" py="2" px="3">
    <Text as="div" size="1" color="gray">
      {label}
    </Text>
    <Text as="div" size="1" weight="medium" truncate className="tabular">
      {value}
    </Text>
  </Flex>
)

const FileMeta = ({ file }: { file: ExcelFile }) => (
  <Grid className="file-meta" columns="3" gap="2">
    <FileMetaItem label="文件大小" value={file.size} />
    <FileMetaItem label="工作表" value={`${file.sheets.length} 个`} />
    <FileMetaItem label="上传时间" value={file.uploadTime} />
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
          icon={<Table2 size={13} strokeWidth={1.75} />}
          title={file.name}
          description="文件解析失败"
          actions={<Badge color="red">错误</Badge>}
        />
        <PanelBody>
          <Flex direction="column" gap="4">
            <Callout.Root color="red" role="alert">
              <Callout.Icon>
                <TriangleAlert size={16} strokeWidth={1.75} />
              </Callout.Icon>
              <Callout.Text>
                <Text weight="medium">{file.name}</Text>：
                {file.error?.message || '未知错误'}
              </Callout.Text>
            </Callout.Root>

            <FileMeta file={file} />

            <Flex justify="end">
              <Button variant="soft" color="gray" onClick={() => setFile(null)}>
                <X size={14} strokeWidth={1.75} />
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
          icon={<Table2 size={13} strokeWidth={1.75} />}
          title={file.name}
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
                <X size={14} strokeWidth={1.75} />
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
        <Grid
          columns={{
            initial: '1',
            lg: 'minmax(320px, 400px) minmax(0, 1fr)',
          }}
          gap="4"
          align="start"
        >
          {/* 左侧筛选 */}
          <Panel>
            <PanelHeader
              icon={<Table2 size={13} strokeWidth={1.75} />}
              title="筛选条件"
            />
            <PanelBody>
              <SheetFilterPanel />
            </PanelBody>
          </Panel>

          {/* 右侧数据预览 */}
          <Box minWidth="0">
            <Panel>
              <PanelHeader
                icon={<Table2 size={13} strokeWidth={1.75} />}
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
                      <ClipboardCopy size={14} strokeWidth={1.75} />
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
                        <Download size={14} strokeWidth={1.75} />
                      )}
                      {isExport ? '导出中…' : '导出 Excel'}
                    </Button>
                  </>
                }
              />
              <PanelBody>
                {sheet ? (
                  <SheetTablePreview sheet={sheet} mode="result" />
                ) : (
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <Table2 size={18} strokeWidth={1.75} />
                      </EmptyMedia>
                      <EmptyTitle>暂无可显示的数据</EmptyTitle>
                      <EmptyDescription>
                        调整左侧筛选条件后再试。
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </PanelBody>
            </Panel>
          </Box>
        </Grid>
      ) : null}
    </Flex>
  )
}

export default ExcelViewer
