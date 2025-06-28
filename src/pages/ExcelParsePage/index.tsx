import { Badge, Box, Button, Card, Flex, Text } from '@radix-ui/themes'
import { FileTextIcon } from '@radix-ui/react-icons'

const ExcelParsePage = () => {
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

      {/* 上传区域 */}
      <Card
        size="3"
        mb="6"
        style={{
          background: 'var(--gray-2)',
          border: '2px dashed var(--gray-7)',
        }}
      >
        <Flex direction="column" align="center" justify="center" gap="4" py="6">
          <Box
            p="4"
            style={{
              background: 'var(--blue-3)',
              borderRadius: '50%',
              color: 'var(--blue-9)',
            }}
          >
            <FileTextIcon width="32" height="32" />
          </Box>
          <Box style={{ textAlign: 'center' }}>
            <Text
              size="4"
              weight="medium"
              mb="2"
              style={{ color: 'var(--gray-12)' }}
            >
              拖拽或点击上传 Excel 文件
            </Text>
            <Text size="2" style={{ color: 'var(--gray-10)' }}>
              支持 .xlsx、.xls 格式
            </Text>
          </Box>
          <Button size="3" variant="soft">
            <FileTextIcon width="16" height="16" />
            选择 Excel 文件
          </Button>
        </Flex>
      </Card>
    </Box>
  )
}

export default ExcelParsePage
