import { useEffect } from 'react'
import {
  Badge,
  Box,
  Button,
  Card,
  Flex,
  IconButton,
  Text,
} from '@radix-ui/themes'
import {
  CheckIcon,
  CopyIcon,
  Cross2Icon,
  DownloadIcon,
  FileTextIcon,
  MixerHorizontalIcon,
} from '@radix-ui/react-icons'

import { useExcelViewer } from '../../hooks/useExcelViewer'
import SheetTablePreview from '../SheetTablePreview'
import SheetFilterPanel from '../SheetFilterPanel'
import { useExcelStore } from '../../stores/excelStore'
import { useSheetFilterStore } from '../../stores/sheetFilterStore'

const ExcelViewer = () => {
  const { file, sheet, setFile } = useExcelStore()
  const { selectedLines, selectedDefects } = useSheetFilterStore()

  if (!file || file.sheets.length === 0) return null

  const {
    getStatusColor,
    getStatusText,
    generateSheetDate,
    handleCopyToClipboard,
    handleExportToExcel,
    isCopy,
    isExport,
  } = useExcelViewer()

  useEffect(() => {
    generateSheetDate()
  }, [file, selectedDefects, selectedLines])

  const handleClearFile = () => setFile(null)

  if (file.status === 'error') {
    return (
      <Card>
        <Flex align="center" justify="between" mb="4">
          <Flex align="center" gap="3">
            <FileTextIcon
              width="20"
              height="20"
              style={{ color: 'var(--red-9)' }}
            />
            <Text size="4" weight="medium">
              文件解析失败
            </Text>
            <Badge color="red" variant="soft">
              错误
            </Badge>
          </Flex>
          <IconButton variant="soft" color="red" onClick={handleClearFile}>
            <Cross2Icon width="16" height="16" />
          </IconButton>
        </Flex>

        <Box
          p="4"
          style={{
            background: 'var(--red-2)',
            borderRadius: '8px',
            border: '1px solid var(--red-6)',
          }}
        >
          <Text
            size="3"
            weight="medium"
            mb="2"
            style={{ color: 'var(--red-11)' }}
          >
            {file.name}
          </Text>
          <Text size="2" style={{ color: 'var(--red-10)' }}>
            错误信息: {file.error?.message || '未知错误'}
          </Text>
          <Flex align="center" gap="3" mt="2">
            <Text size="2" style={{ color: 'var(--gray-10)' }}>
              文件大小: {file.size}
            </Text>
            <Text size="2" style={{ color: 'var(--gray-10)' }}>
              上传时间: {file.uploadTime}
            </Text>
          </Flex>
        </Box>
      </Card>
    )
  }

  return (
    <Card>
      <Flex align="center" justify="between" mb="4">
        <Flex align="center" gap="3">
          <FileTextIcon
            width="20"
            height="20"
            style={{ color: 'var(--blue-9)' }}
          />
          <Text size="4" weight="medium">
            Excel 文件详情
          </Text>
          <Badge color={getStatusColor(file.status)} variant="soft">
            {getStatusText(file.status)}
          </Badge>
        </Flex>
        <IconButton variant="soft" color="red" onClick={handleClearFile}>
          <Cross2Icon width="16" height="16" />
        </IconButton>
      </Flex>

      {/* 文件信息 */}
      <Box
        p="3"
        mb="4"
        style={{
          background: 'var(--gray-2)',
          borderRadius: '8px',
          border: '1px solid var(--gray-6)',
        }}
      >
        <Text size="3" weight="medium" mb="2">
          {file.name}
        </Text>
        <Flex align="center" gap="4" wrap="wrap">
          <Text size="2" style={{ color: 'var(--gray-10)' }}>
            文件大小: {file.size}
          </Text>
          <Text size="2" style={{ color: 'var(--gray-10)' }}>
            工作表数量: {file.sheets.length}
          </Text>
          <Text size="2" style={{ color: 'var(--gray-10)' }}>
            上传时间: {file.uploadTime}
          </Text>
        </Flex>
      </Box>

      {file.status === 'completed' && (
        <>
          {/* 空值检查 */}
          {!sheet && (
            <Box height="400px">
              <Flex align="center" justify="center" height="100%">
                <Text size="3">暂无可显示的数据</Text>
              </Flex>
            </Box>
          )}

          <Box mb="4">
            <Flex align="center" gap="2" mb="4">
              <MixerHorizontalIcon
                width="18"
                height="18"
                style={{ color: 'var(--blue-9)' }}
              />
              <Text size="4" weight="medium">
                扫描配置
              </Text>
            </Flex>

            {/* 过滤面板 */}
            <SheetFilterPanel />
          </Box>

          {/* 第一个工作表内容 */}
          {sheet && (
            <Card>
              <Flex align="center" justify="between" mb="3">
                <Flex align="center" gap="3">
                  <Text size="2" weight="bold">
                    {sheet.name}
                  </Text>
                  <Badge variant="soft">
                    {sheet.rowCount}行 x {sheet.colCount}列
                  </Badge>
                </Flex>

                <Flex align="center" gap="3">
                  <Button
                    variant="soft"
                    size="2"
                    disabled={isCopy}
                    onClick={() => handleCopyToClipboard(sheet)}
                  >
                    {isCopy ? (
                      <>
                        <CheckIcon width="14" height="14" />
                        已复制
                      </>
                    ) : (
                      <>
                        <CopyIcon width="14" height="14" />
                        复制到剪切板
                      </>
                    )}
                  </Button>
                  <Button
                    variant="soft"
                    size="2"
                    disabled={isExport}
                    onClick={() => handleExportToExcel(sheet)}
                  >
                    <DownloadIcon width="14" height="14" />
                    导出为 Excel
                  </Button>
                </Flex>
              </Flex>

              {/* 渲染表格数据 */}
              <Box height="400px">
                <SheetTablePreview sheet={sheet} mode="result" />
              </Box>
            </Card>
          )}
        </>
      )}

      {file.status === 'processing' && (
        <Box p="6" style={{ textAlign: 'center' }}>
          <div className="processing-indicator">
            <FileTextIcon width="32" height="32" />
          </div>
          <Text size="3" weight="medium" mt="3">
            正在解析 Excel 文件...
          </Text>
          <Text size="2" style={{ color: 'var(--gray-10)' }} mt="1">
            请稍候，正在读取工作表数据
          </Text>
        </Box>
      )}
    </Card>
  )
}

export default ExcelViewer
