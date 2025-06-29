import type { FC } from 'react'
import { Badge, Box, Card, Flex, IconButton, Text } from '@radix-ui/themes'
import { Cross2Icon, FileTextIcon } from '@radix-ui/react-icons'

import type { ExcelFile } from '../../hooks/useExcelUpload'

interface ExcelViewerProps {
  file: ExcelFile
  onClearFile: () => void
}

const ExcelViewer: FC<ExcelViewerProps> = ({ file, onClearFile }) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'green'
      case 'processing':
        return 'orange'
      case 'error':
        return 'red'
      default:
        return 'gray'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return '解析完成'
      case 'processing':
        return '处理中'
      case 'error':
        return '解析失败'
      default:
        return '未知状态'
    }
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
    </Card>
  )
}

export default ExcelViewer
