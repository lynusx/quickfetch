import { Badge, Box, Flex, Grid, Text } from '@radix-ui/themes'
import { ClipboardCopy, Info, Search, Table2, Upload } from 'lucide-react'

import { PageShell } from '@/components/page-shell/page-shell'
import { Panel, PanelBody, PanelHeader } from '@/components/panel'
import { Step } from '@/components/field'
import ExcelUploadZone from './components/excel-upload-zone'
import ExcelViewer from './components/excel-viewer'
import { MAX_EXCEL_SIZE_LABEL } from './constants'
import { useExcelStore } from './stores/excelStore'
import './excel.css'

const GUIDE = [
  {
    icon: Upload,
    title: '上传文件',
    text: `拖拽或点击选择单个 .xlsx / .xls 文件，最大 ${MAX_EXCEL_SIZE_LABEL}。`,
  },
  {
    icon: Table2,
    title: '解析数据',
    text: '自动解析第 1 个工作表，按设备 ID 分组统计。',
  },
  {
    icon: Search,
    title: '筛选数据',
    text: '按线别与不良项组合筛选，结果实时刷新。',
  },
  {
    icon: ClipboardCopy,
    title: '导出数据',
    text: '复制到剪切板，或另存为 xlsx 文件。',
  },
]

const ExcelParsePage = () => {
  const { file } = useExcelStore()

  return (
    <PageShell
      title="Excel 解析"
      badge={
        <Badge variant="outline" color="gray">
          Beta
        </Badge>
      }
    >
      <ExcelUploadZone />

      {file ? (
        <Box mt="5">
          <ExcelViewer />
        </Box>
      ) : (
        <Panel>
          <PanelHeader
            icon={<Info size={13} strokeWidth={1.75} />}
            title="使用说明"
          />
          <PanelBody>
            <Grid columns="repeat(auto-fit, minmax(220px, 1fr))" gap="4">
              {GUIDE.map((item, index) => (
                <Step key={item.title} index={index + 1}>
                  <Box>
                    <Flex align="center" gap="2">
                      <item.icon size={13} strokeWidth={1.75} />
                      <Text size="1" weight="medium">
                        {item.title}
                      </Text>
                    </Flex>
                    <Text as="p" size="1" color="gray" mt="1">
                      {item.text}
                    </Text>
                  </Box>
                </Step>
              ))}
            </Grid>
          </PanelBody>
        </Panel>
      )}
    </PageShell>
  )
}

export default ExcelParsePage
