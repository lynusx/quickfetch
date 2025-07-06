import { Badge, Box, Card, Flex, Strong, Text } from '@radix-ui/themes'
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
          解析和处理 Excel 文件，支持单文件数据解析、数据筛选、数据导出
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

        {/* 使用说明 */}
        {!currentFile && (
          <Card size="3">
            <Text size="4" weight="medium" mb="4">
              使用说明
            </Text>
            <Flex direction="column" gap="3">
              <Box>
                <Text size="3" weight="medium" mb="1" mr="1">
                  1. 上传文件
                </Text>
                <Text size="2" style={{ color: 'var(--gray-11)' }}>
                  支持拖拽或点击上传<Strong>单个Excel</Strong>文件（.xlsx 或
                  .xls 格式）
                </Text>
              </Box>
              <Box>
                <Text size="3" weight="medium" mb="1" mr="1">
                  2. 解析数据
                </Text>
                <Text size="2" style={{ color: 'var(--gray-11)' }}>
                  自动解析<Strong>第1个</Strong>工作表，解析完成后根据{' '}
                  <Badge color="blue" variant="soft">
                    设备ID
                  </Badge>{' '}
                  进行分组统计
                </Text>
              </Box>
              <Box>
                <Text size="3" weight="medium" mb="1" mr="1">
                  3. 筛选数据
                </Text>
                <Text size="2" style={{ color: 'var(--gray-11)' }}>
                  支持根据{' '}
                  <Badge color="blue" variant="soft">
                    线别
                  </Badge>{' '}
                  和{' '}
                  <Badge color="blue" variant="soft">
                    不良项
                  </Badge>{' '}
                  筛选数据
                </Text>
              </Box>
              <Box>
                <Text size="3" weight="medium" mb="1" mr="1">
                  4. 导出数据
                </Text>
                <Text size="2" style={{ color: 'var(--gray-11)' }}>
                  可将筛选结果<Strong>复制到剪切板</Strong>或
                  <Strong>导出为 xlsx</Strong>
                  格式文件
                </Text>
              </Box>
            </Flex>
          </Card>
        )}
      </Flex>
    </Box>
  )
}

export default ExcelParsePage
