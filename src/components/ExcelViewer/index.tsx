import { useState, type FC } from 'react'
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
  Cross2Icon,
  EyeClosedIcon,
  EyeOpenIcon,
  FileTextIcon,
} from '@radix-ui/react-icons'

import type { ExcelFile } from '../../hooks/useExcelUpload'
import { useExcelViewer } from '../../hooks/useExcelViewer'

interface ExcelViewerProps {
  file: ExcelFile
  onClearFile: () => void
}

const ExcelViewer: FC<ExcelViewerProps> = ({ file, onClearFile }) => {
  const [previewMode, setPreviewMode] = useState<'result' | 'original'>(
    'result',
  )

  const { getStatusColor, getStatusText } = useExcelViewer()

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
          {/* 预览模式切换 */}
          <Flex align="center" justify="between" mb="4">
            <Text size="3" weight="medium">
              预览模式
            </Text>

            <Flex align="center" gap="2">
              <Button
                variant={previewMode === 'result' ? 'solid' : 'soft'}
                size="2"
                onClick={() => setPreviewMode('result')}
              >
                {previewMode === 'result' ? (
                  <EyeOpenIcon width="14" height="14" />
                ) : (
                  <EyeClosedIcon width="14" height="14" />
                )}
                解析结果
              </Button>
              <Button
                variant={previewMode === 'original' ? 'solid' : 'soft'}
                size="2"
                onClick={() => setPreviewMode('original')}
              >
                {previewMode === 'original' ? (
                  <EyeOpenIcon width="14" height="14" />
                ) : (
                  <EyeClosedIcon width="14" height="14" />
                )}
                原始数据
              </Button>
            </Flex>
          </Flex>

          {/* 工作表选项卡 */}
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
