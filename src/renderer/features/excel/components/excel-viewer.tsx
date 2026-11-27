import { useEffect, useRef } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import {
  ClipboardCopy,
  Download,
  Filter,
  Table2,
  TriangleAlert,
  Upload,
  X,
} from 'lucide-react'
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
import { useExcelUpload } from '../hooks/useExcelUpload'
import { useExcelViewer } from '../hooks/useExcelViewer'
import { useExcelStore } from '../stores/excelStore'

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
  const { isDrag, isProcess, setIsDrag, uploadFile } = useExcelUpload()
  const {
    generateSheetDate,
    handleCopyToClipboard,
    handleExportToExcel,
    isCopy,
    isExport,
  } = useExcelViewer()
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDrag(true)
  }

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
      setIsDrag(false)
    }
  }

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDrag(false)

    const files = event.dataTransfer.files
    if (files.length > 0 && !isProcess) {
      uploadFile(files[0])
    }
  }

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (files && files.length > 0) {
      uploadFile(files[0])
    }
    event.target.value = ''
  }

  return (
    <Flex direction="column" gap="4">
      {/* 紧凑单行文件状态栏：支持直接拖拽新文件替换 */}
      <Panel className="excel-file-bar">
        <Flex
          align="center"
          justify="between"
          gap="3"
          wrap="wrap"
          px="4"
          py="3"
          data-drag={isDrag || undefined}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <Flex align="center" gap="3" minWidth="0" flexGrow="1">
            <Flex
              className="excel-file-icon"
              align="center"
              justify="center"
              width="32px"
              height="32px"
              flexShrink="0"
            >
              <Table2 size={16} strokeWidth={1.75} />
            </Flex>
            <Flex direction="column" gap="1" minWidth="0">
              <Flex align="center" gap="2" minWidth="0">
                <Text size="2" weight="medium" truncate>
                  {file.name}
                </Text>
                <Badge color={statusMeta.color} variant={statusMeta.variant}>
                  {statusMeta.label}
                </Badge>
              </Flex>
              <Text size="2" color="gray" truncate className="tabular">
                {isDrag
                  ? '释放文件以替换当前 Excel'
                  : `${file.size} · ${file.sheets.length} 个工作表 · ${file.uploadTime}`}
              </Text>
            </Flex>
          </Flex>

          <Flex align="center" gap="2" flexShrink="0">
            <Button
              type="button"
              variant="soft"
              color="gray"
              disabled={isProcess}
              onClick={() => fileInputRef.current?.click()}
            >
              {isProcess ? (
                <Spinner size="1" />
              ) : (
                <Upload size={14} strokeWidth={1.75} />
              )}
              {isProcess ? '解析中…' : '更换文件'}
            </Button>
            <IconButton
              type="button"
              variant="ghost"
              color="gray"
              aria-label="清除文件"
              disabled={isProcess}
              onClick={() => setFile(null)}
            >
              <X size={15} strokeWidth={1.75} />
            </IconButton>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              hidden
              onChange={handleFileInputChange}
              disabled={isProcess}
            />
          </Flex>
        </Flex>
      </Panel>

      {file.status === 'error' ? (
        <Callout.Root color="red" role="alert">
          <Callout.Icon>
            <TriangleAlert size={16} strokeWidth={1.75} />
          </Callout.Icon>
          <Callout.Text>
            <Text size="2" weight="medium">
              {file.name}
            </Text>
            ：{file.error?.message || '未知错误'}
          </Callout.Text>
        </Callout.Root>
      ) : null}

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
              <Spinner />
              <Text weight="medium" size="2">
                正在解析 Excel 文件…
              </Text>
              <Text size="2" color="gray">
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
            lg: '300px minmax(0, 1fr)',
          }}
          gap="4"
          align="start"
        >
          {/* 左侧筛选 */}
          <Panel>
            <PanelHeader
              icon={<Filter size={15} strokeWidth={1.75} />}
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
                icon={<Table2 size={15} strokeWidth={1.75} />}
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
                      disabled={!sheet || isCopy}
                      onClick={() => sheet && handleCopyToClipboard(sheet)}
                    >
                      <ClipboardCopy size={14} strokeWidth={1.75} />
                      {isCopy ? '已复制' : '复制'}
                    </Button>
                    <Button
                      variant="soft"
                      color="gray"
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
