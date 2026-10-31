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
  Card,
  Flex,
  Grid,
  Heading,
  IconButton,
  Spinner,
  Text,
} from '@radix-ui/themes'

import SheetFilterPanel from './SheetFilterPanel'
import SheetTablePreview from './SheetTablePreview'
import { useExcelViewer } from '../hooks/useExcelViewer'
import { useExcelStore } from '../stores/excelStore'

import type { ExcelFile } from '../types'

const FileMeta = ({ file }: { file: ExcelFile }) => (
  <Grid columns="3" gap="3">
    <Flex direction="column" gap="1">
      <Text size="1" color="gray">
        文件大小
      </Text>
      <Text size="2" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {file.size}
      </Text>
    </Flex>
    <Flex direction="column" gap="1">
      <Text size="1" color="gray">
        工作表
      </Text>
      <Text size="2" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {file.sheets.length} 个
      </Text>
    </Flex>
    <Flex direction="column" gap="1">
      <Text size="1" color="gray">
        上传时间
      </Text>
      <Text size="2" style={{ fontVariantNumeric: 'tabular-nums' }}>
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
      <Card size="2">
        <Flex justify="between" align="center" mb="3">
          <Flex align="center" gap="2">
            <TableIcon
              width={16}
              height={16}
              style={{ color: 'var(--red-9)' }}
            />
            <Heading size="3">文件解析失败</Heading>
          </Flex>
          <Badge color="red" variant="soft">
            错误
          </Badge>
        </Flex>

        <Flex direction="column" gap="4">
          <Callout.Root color="red" role="alert">
            <Callout.Icon>
              <ExclamationTriangleIcon width={16} height={16} />
            </Callout.Icon>
            <Callout.Text>
              <Text weight="medium">{file.name}</Text>:{' '}
              {file.error?.message || '未知错误'}
            </Callout.Text>
          </Callout.Root>

          <Flex justify="between" align="center" gap="4">
            <Box style={{ flex: 1 }}>
              <FileMeta file={file} />
            </Box>
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
      </Card>
    )
  }

  return (
    <Flex direction="column" gap="5">
      {/* 文件信息 */}
      <Card size="2">
        <Flex justify="between" align="start" mb="3">
          <Flex direction="column" gap="1" style={{ minWidth: 0, flex: 1 }}>
            <Flex align="center" gap="2">
              <TableIcon
                width={16}
                height={16}
                style={{
                  flexShrink: 0,
                  color: 'var(--gray-10)',
                }}
              />
              <Heading
                size="3"
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {file.name}
              </Heading>
              <Badge color={statusMeta.color} variant={statusMeta.variant}>
                {statusMeta.label}
              </Badge>
            </Flex>
            <Text size="1" color="gray">
              单文件解析，默认读取第 1 个工作表
            </Text>
          </Flex>

          <IconButton
            variant="ghost"
            color="gray"
            size="1"
            aria-label="清除文件"
            onClick={() => setFile(null)}
          >
            <Cross2Icon width={14} height={14} />
          </IconButton>
        </Flex>

        <FileMeta file={file} />
      </Card>

      {file.status === 'processing' && (
        <Card size="2">
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
        </Card>
      )}

      {file.status === 'completed' && (
        <Grid columns={{ initial: '1', xl: '320px 1fr' }} gap="5" align="start">
          {/* 左侧筛选 */}
          <Card
            size="2"
            style={{
              position: 'sticky',
              top: '1rem',
            }}
          >
            <Flex direction="column" gap="1" mb="3">
              <Heading size="3">筛选条件</Heading>
              <Text size="1" color="gray">
                线别与不良项可组合筛选，留空表示不过滤
              </Text>
            </Flex>
            <SheetFilterPanel />
          </Card>

          {/* 右侧数据预览 */}
          <Card size="2">
            <Flex justify="between" align="center" mb="3">
              <Flex align="center" gap="2" style={{ minWidth: 0, flex: 1 }}>
                <Heading
                  size="3"
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {sheet?.name || '数据预览'}
                </Heading>
                {sheet && (
                  <Badge
                    variant="outline"
                    color="gray"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {sheet.rowCount} 行 × {sheet.colCount} 列
                  </Badge>
                )}
              </Flex>

              <Flex align="center" gap="2" style={{ flexShrink: 0 }}>
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
              </Flex>
            </Flex>

            <Box
              style={{
                borderRadius: 'var(--radius-3)',
                border: '1px solid var(--gray-4)',
                overflow: 'hidden',
              }}
            >
              {sheet ? (
                <SheetTablePreview sheet={sheet} mode="result" />
              ) : (
                <Flex
                  direction="column"
                  align="center"
                  justify="center"
                  gap="2"
                  py="6"
                  style={{ minHeight: 240 }}
                >
                  <TableIcon
                    width={28}
                    height={28}
                    style={{ color: 'var(--gray-8)' }}
                  />
                  <Heading size="3">暂无可显示的数据</Heading>
                  <Text size="1" color="gray">
                    调整筛选条件后再试
                  </Text>
                </Flex>
              )}
            </Box>
          </Card>
        </Grid>
      )}
    </Flex>
  )
}

export default ExcelViewer
