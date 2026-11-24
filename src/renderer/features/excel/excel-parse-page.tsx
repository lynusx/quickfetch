import { Badge } from '@radix-ui/themes'

import { HelpTip } from '@/components/help-tip/help-tip'
import { PageShell } from '@/components/page-shell/page-shell'
import ExcelUploadZone from './components/excel-upload-zone'
import ExcelViewer from './components/excel-viewer'
import { MAX_EXCEL_SIZE_LABEL } from './constants'
import { useExcelStore } from './stores/excelStore'
import './excel.css'

const ExcelParsePage = () => {
  const { file } = useExcelStore()

  return (
    <PageShell
      title="Excel 解析"
      contentMaxWidth="1360px"
      help={
        <HelpTip title="Excel 解析说明">
          拖拽或选择单个 .xlsx / .xls 文件（最大 {MAX_EXCEL_SIZE_LABEL}
          ），自动解析第 1 个工作表并按设备 ID
          分组统计；可按线别与不良项筛选后复制到剪切板或导出为 xlsx 文件。
        </HelpTip>
      }
      badge={
        <Badge variant="outline" color="gray">
          Beta
        </Badge>
      }
    >
      {file ? <ExcelViewer /> : <ExcelUploadZone />}
    </PageShell>
  )
}

export default ExcelParsePage
