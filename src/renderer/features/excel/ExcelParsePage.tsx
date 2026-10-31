import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import ExcelUploadZone from './components/ExcelUploadZone'
import ExcelViewer from './components/ExcelViewer'
import { useExcelStore } from './stores/excelStore'

const ExcelParsePage = () => {
  const { file } = useExcelStore()

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Excel 解析</h1>
          <Badge variant="outline">Beta</Badge>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          解析单个 Excel 文件，按设备 ID
          分组后，支持按线别与不良项筛选，并导出为 xlsx。
        </p>
      </header>

      <ExcelUploadZone />

      {file && <ExcelViewer />}

      <Card>
        <CardHeader>
          <CardTitle>使用说明</CardTitle>
          <CardDescription>上传、解析、筛选、导出</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-4 text-sm sm:grid-cols-2">
            <li className="flex gap-3">
              <span className="font-mono text-xs text-muted-foreground">
                01
              </span>
              <span>
                <span className="font-medium">上传文件。</span>
                <span className="text-muted-foreground">
                  拖拽或点击选择单个 .xlsx / .xls 文件，最大 50MB。
                </span>
              </span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-xs text-muted-foreground">
                02
              </span>
              <span>
                <span className="font-medium">解析数据。</span>
                <span className="text-muted-foreground">
                  自动解析第 1 个工作表，按设备 ID 分组统计。
                </span>
              </span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-xs text-muted-foreground">
                03
              </span>
              <span>
                <span className="font-medium">筛选数据。</span>
                <span className="text-muted-foreground">
                  按线别与不良项组合筛选，结果实时刷新。
                </span>
              </span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-xs text-muted-foreground">
                04
              </span>
              <span>
                <span className="font-medium">导出数据。</span>
                <span className="text-muted-foreground">
                  复制到剪切板，或另存为 xlsx 文件。
                </span>
              </span>
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}

export default ExcelParsePage
