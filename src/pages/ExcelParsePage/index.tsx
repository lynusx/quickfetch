import { Badge, Box, Card, Flex, Text } from '@radix-ui/themes'
import { FileTextIcon } from '@radix-ui/react-icons'

import { useExcelUpload } from '../../hooks/useExcelUpload'
import ExcelUploadZone from '../../components/ExcelUploadZone'
import ExcelViewer from '../../components/ExcelViewer'

const ExcelParsePage = () => {
  const {
    currentFile,
    isDragging,
    isProcessing,
    setIsDragging,
    uploadFile,
    clearFile,
  } = useExcelUpload()

  return (
    <Box>
      {/* 页面标题 */}
      <Box mb="6">
        <Flex align="center" gap="3" mb="2">
          <FileTextIcon
            width="24"
            height="24"
            style={{ color: 'var(--accent-9)' }}
          />
          <Text size="6" weight="bold" style={{ color: 'var(--gray-12)' }}>
            Excel 解析工具
          </Text>
          <Badge color="blue" variant="soft">
            Beta
          </Badge>
        </Flex>
        <Text size="3" style={{ color: 'var(--gray-11)' }}>
          解析和处理 Excel 文件，支持数据提取、格式转换和批量处理
        </Text>
      </Box>

      {/* 功能卡片 */}
      <Flex direction="column" gap="4">
        {/* 上传区域 */}
        <Card size="3">
          <ExcelUploadZone
            onFileSelected={uploadFile}
            isDragging={isDragging}
            onDragStateChange={setIsDragging}
            isProcessing={isProcessing}
            hasFile={!!currentFile}
          />
        </Card>

        {/* Excel文件查看器 */}
        {currentFile && (
          <ExcelViewer file={currentFile} onClearFile={clearFile} />
        )}
      </Flex>
    </Box>
  )
}

export default ExcelParsePage
