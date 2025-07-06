import { type FC } from 'react'
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
} from '@radix-ui/react-icons'

import type { ExcelFile } from '../../hooks/useExcelUpload'
import { useExcelViewer } from '../../hooks/useExcelViewer'
import SheetTablePreview from '../SheetTablePreview'

interface ExcelViewerProps {
  file: ExcelFile
  onClearFile: () => void
}

const ExcelViewer: FC<ExcelViewerProps> = ({ file, onClearFile }) => {
  const {
    getStatusColor,
    getStatusText,
    generatePreviewData,
    handleCopyToClipboard,
    handleExportToExcel,
    isCopied,
    isExported,
  } = useExcelViewer(file)

  // 获取第一个工作表的数据
  const displayData =
    generatePreviewData.length > 0 ? generatePreviewData[0] : null

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
          <IconButton variant="soft" color="red" onClick={onClearFile}>
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
            错误信息: {file.error || '未知错误'}
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
        <IconButton variant="soft" color="red" onClick={onClearFile}>
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
          {!displayData && (
            <Box height="400px">
              <Flex align="center" justify="center" height="100%">
                <Text size="3">暂无可显示的数据</Text>
              </Flex>
            </Box>
          )}

          {/* 第一个工作表内容 */}
          {displayData && (
            <Card>
              <Flex align="center" justify="between" mb="3">
                <Flex align="center" gap="3">
                  <Text size="2" weight="bold">
                    {displayData.name}
                  </Text>
                  <Badge variant="soft">
                    {displayData.rowCount}行 x {displayData.colCount}列
                  </Badge>
                </Flex>

                <Flex align="center" gap="3">
                  <Button
                    variant="soft"
                    size="2"
                    disabled={isCopied}
                    onClick={() => handleCopyToClipboard(displayData)}
                  >
                    {isCopied ? (
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
                    disabled={isExported}
                    onClick={() => handleExportToExcel(displayData)}
                  >
                    <DownloadIcon width="14" height="14" />
                    导出为 Excel
                  </Button>
                </Flex>
              </Flex>

              {/* 渲染表格数据 */}
              <Box height="400px">
                <SheetTablePreview sheet={displayData} mode="result" />
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
