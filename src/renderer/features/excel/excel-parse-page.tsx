import { Badge, Box, Flex, Grid, Text } from '@radix-ui/themes'
import {
  ClipboardCopyIcon,
  InfoCircledIcon,
  MagnifyingGlassIcon,
  TableIcon,
  UploadIcon,
} from '@radix-ui/react-icons'

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
    icon: UploadIcon,
    title: '上传文件',
    text: `拖拽或点击选择单个 .xlsx / .xls 文件，最大 ${MAX_EXCEL_SIZE_LABEL}。`,
  },
  {
    icon: TableIcon,
    title: '解析数据',
    text: '自动解析第 1 个工作表，按设备 ID 分组统计。',
  },
  {
    icon: MagnifyingGlassIcon,
    title: '筛选数据',
    text: '按线别与不良项组合筛选，结果实时刷新。',
  },
  {
    icon: ClipboardCopyIcon,
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
      description="解析单个 Excel 文件，按设备 ID 分组后，支持按线别与不良项筛选，并导出为 xlsx。"
    >
      <ExcelUploadZone />

      {file ? (
        <Box mt="5">
          <ExcelViewer />
        </Box>
      ) : (
        <Panel>
          <PanelHeader
            icon={<InfoCircledIcon width={13} height={13} />}
            title="使用说明"
            description="上传、解析、筛选、导出，四步完成"
          />
          <PanelBody>
            <Grid className="guide-grid" gap="4">
              {GUIDE.map((item, index) => (
                <Step key={item.title} index={index + 1}>
                  <Box>
                    <Flex className="guide-title" align="center" gap="1">
                      <item.icon width={13} height={13} />
                      <Text size="1" weight="medium">
                        {item.title}
                      </Text>
                    </Flex>
                    <Text as="p" size="1" color="gray" className="guide-text">
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
