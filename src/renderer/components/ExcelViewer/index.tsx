import { useEffect } from 'react'
import {
  CircleAlert,
  ClipboardCopy,
  Download,
  FileSpreadsheet,
  Loader2,
  Table2,
  X,
} from 'lucide-react'

import SheetFilterPanel from '@/components/SheetFilterPanel'
import SheetTablePreview from '@/components/SheetTablePreview'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { useExcelViewer } from '@/hooks/useExcelViewer'
import { useExcelStore } from '@/stores/excelStore'
import { useSheetFilterStore } from '@/stores/sheetFilterStore'

import type { ExcelFile } from '@/types'

const FileMeta = ({ file }: { file: ExcelFile }) => (
  <dl className="grid grid-cols-3 gap-3 text-sm">
    <div className="flex flex-col gap-1">
      <dt className="text-xs text-muted-foreground">文件大小</dt>
      <dd className="tabular-nums">{file.size}</dd>
    </div>
    <div className="flex flex-col gap-1">
      <dt className="text-xs text-muted-foreground">工作表</dt>
      <dd className="tabular-nums">{file.sheets.length} 个</dd>
    </div>
    <div className="flex flex-col gap-1">
      <dt className="text-xs text-muted-foreground">上传时间</dt>
      <dd className="tabular-nums">{file.uploadTime}</dd>
    </div>
  </dl>
)

const ExcelViewer = () => {
  const { file, sheet, setFile } = useExcelStore()
  const { selectedLines, selectedDefects } = useSheetFilterStore()
  const {
    getStatusVariant,
    getStatusText,
    generateSheetDate,
    handleCopyToClipboard,
    handleExportToExcel,
    isCopy,
    isExport,
  } = useExcelViewer()

  useEffect(() => {
    generateSheetDate()
  }, [file, selectedDefects, selectedLines])

  if (!file) return null

  if (file.status === 'error') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="size-4 text-destructive" />
            文件解析失败
          </CardTitle>
          <CardAction>
            <Badge variant="destructive">错误</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>{file.name}</AlertTitle>
            <AlertDescription>
              {file.error?.message || '未知错误'}
            </AlertDescription>
          </Alert>
          <div className="flex items-center justify-between gap-4">
            <FileMeta file={file} />
            <Button variant="outline" onClick={() => setFile(null)}>
              <X data-icon="inline-start" />
              清除文件
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 文件信息 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex min-w-0 items-center gap-2">
            <FileSpreadsheet className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{file.name}</span>
            <Badge variant={getStatusVariant(file.status)}>
              {getStatusText(file.status)}
            </Badge>
          </CardTitle>
          <CardDescription>单文件解析，默认读取第 1 个工作表</CardDescription>
          <CardAction>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="清除文件"
              onClick={() => setFile(null)}
            >
              <X />
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <FileMeta file={file} />
        </CardContent>
      </Card>

      {file.status === 'processing' && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
            <p className="text-sm font-medium">正在解析 Excel 文件…</p>
            <p className="text-xs text-muted-foreground">
              请稍候，正在读取工作表数据
            </p>
          </CardContent>
        </Card>
      )}

      {file.status === 'completed' && (
        <div className="grid items-start gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <Card className="xl:sticky xl:top-6">
            <CardHeader>
              <CardTitle>筛选条件</CardTitle>
              <CardDescription>
                线别与不良项可组合筛选，留空表示不过滤
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SheetFilterPanel />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="truncate">{sheet?.name || '数据预览'}</span>
                {sheet && (
                  <Badge variant="outline" className="tabular-nums">
                    {sheet.rowCount} 行 × {sheet.colCount} 列
                  </Badge>
                )}
              </CardTitle>
              <CardAction>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!sheet || isCopy}
                    onClick={() => sheet && handleCopyToClipboard(sheet)}
                  >
                    <ClipboardCopy data-icon="inline-start" />
                    {isCopy ? '已复制' : '复制'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!sheet || isExport}
                    onClick={() => sheet && handleExportToExcel(sheet)}
                  >
                    {isExport ? (
                      <Loader2
                        className="animate-spin"
                        data-icon="inline-start"
                      />
                    ) : (
                      <Download data-icon="inline-start" />
                    )}
                    {isExport ? '导出中…' : '导出 Excel'}
                  </Button>
                </div>
              </CardAction>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border">
                {sheet ? (
                  <SheetTablePreview sheet={sheet} mode="result" />
                ) : (
                  <Empty className="min-h-60">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <Table2 />
                      </EmptyMedia>
                      <EmptyTitle>暂无可显示的数据</EmptyTitle>
                      <EmptyDescription>调整筛选条件后再试</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

export default ExcelViewer
