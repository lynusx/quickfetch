import { Badge, Box, Card, Flex, Grid, Heading, Text } from '@radix-ui/themes'
import ExcelUploadZone from './components/ExcelUploadZone'
import ExcelViewer from './components/ExcelViewer'
import { useExcelStore } from './stores/excelStore'

const ExcelParsePage = () => {
  const { file } = useExcelStore()

  return (
    <Flex direction="column" gap="6">
      <Flex direction="column" gap="1">
        <Flex align="center" gap="3">
          <Heading size="6">Excel 解析</Heading>
          <Badge variant="outline" color="gray">
            Beta
          </Badge>
        </Flex>
        <Text size="2" color="gray" style={{ maxWidth: 640 }}>
          解析单个 Excel 文件，按设备 ID
          分组后，支持按线别与不良项筛选，并导出为 xlsx。
        </Text>
      </Flex>

      <ExcelUploadZone />

      {file && <ExcelViewer />}

      <Card size="2">
        <Flex direction="column" gap="1" mb="3">
          <Heading size="3">使用说明</Heading>
          <Text size="1" color="gray">
            上传、解析、筛选、导出
          </Text>
        </Flex>

        <Grid columns={{ initial: '1', sm: '2' }} gap="4">
          <Flex gap="3">
            <Text
              size="1"
              color="gray"
              style={{ fontFamily: 'var(--font-mono)', flexShrink: 0 }}
            >
              01
            </Text>
            <Box>
              <Text weight="medium" size="2">
                上传文件。
              </Text>{' '}
              <Text size="2" color="gray">
                拖拽或点击选择单个 .xlsx / .xls 文件，最大 50MB。
              </Text>
            </Box>
          </Flex>

          <Flex gap="3">
            <Text
              size="1"
              color="gray"
              style={{ fontFamily: 'var(--font-mono)', flexShrink: 0 }}
            >
              02
            </Text>
            <Box>
              <Text weight="medium" size="2">
                解析数据。
              </Text>{' '}
              <Text size="2" color="gray">
                自动解析第 1 个工作表，按设备 ID 分组统计。
              </Text>
            </Box>
          </Flex>

          <Flex gap="3">
            <Text
              size="1"
              color="gray"
              style={{ fontFamily: 'var(--font-mono)', flexShrink: 0 }}
            >
              03
            </Text>
            <Box>
              <Text weight="medium" size="2">
                筛选数据。
              </Text>{' '}
              <Text size="2" color="gray">
                按线别与不良项组合筛选，结果实时刷新。
              </Text>
            </Box>
          </Flex>

          <Flex gap="3">
            <Text
              size="1"
              color="gray"
              style={{ fontFamily: 'var(--font-mono)', flexShrink: 0 }}
            >
              04
            </Text>
            <Box>
              <Text weight="medium" size="2">
                导出数据。
              </Text>{' '}
              <Text size="2" color="gray">
                复制到剪切板，或另存为 xlsx 文件。
              </Text>
            </Box>
          </Flex>
        </Grid>
      </Card>
    </Flex>
  )
}

export default ExcelParsePage
