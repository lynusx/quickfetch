import { Table2 } from 'lucide-react'

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import type { ExcelSheet } from '../types'

interface SheetTablePreviewProps {
  sheet: ExcelSheet
  mode: 'result' | 'original'
  maxHeight?: string
}

const MAX_ORIGINAL_ROWS = 20
const MAX_RESULT_ROWS = 100
const MAX_COLS = 10

const SheetTablePreview = ({
  sheet,
  mode,
  maxHeight = '420px',
}: SheetTablePreviewProps) => {
  if (sheet.data.length === 0) {
    return (
      <Empty className="min-h-60">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Table2 />
          </EmptyMedia>
          <EmptyTitle>暂无可显示的数据</EmptyTitle>
          <EmptyDescription>调整筛选条件后再试</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  let displayData = sheet.data
  let showRowTruncation = false
  let showColTruncation = false
  let hiddenRowsCount = 0

  if (mode === 'original') {
    if (sheet.rowCount > MAX_ORIGINAL_ROWS) {
      displayData = displayData.slice(0, MAX_ORIGINAL_ROWS + 1)
      showRowTruncation = true
      hiddenRowsCount = sheet.rowCount - MAX_ORIGINAL_ROWS
    }

    if (sheet.colCount > MAX_COLS) {
      displayData = displayData.map((row) => row.slice(0, MAX_COLS))
      showColTruncation = true
    }
  } else if (mode === 'result') {
    if (sheet.rowCount > MAX_RESULT_ROWS) {
      displayData = displayData.slice(0, MAX_RESULT_ROWS + 1)
      showRowTruncation = true
      hiddenRowsCount = sheet.rowCount - MAX_RESULT_ROWS
    }
  }

  const headerRow = displayData[0]
  const dataRows = displayData.slice(1)

  return (
    <ScrollArea style={{ maxHeight }} className="w-full">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-background">
          <TableRow>
            {headerRow.map((cell, index) => (
              <TableHead key={index} className="whitespace-nowrap">
                {cell}
              </TableHead>
            ))}
            {showColTruncation && (
              <TableHead className="whitespace-nowrap text-muted-foreground">
                还有 {sheet.colCount - MAX_COLS} 列
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {dataRows.map((row, rowIndex) => (
            <TableRow key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <TableCell
                  key={cellIndex}
                  className="whitespace-nowrap tabular-nums"
                >
                  {cell}
                </TableCell>
              ))}
              {showColTruncation && (
                <TableCell className="text-muted-foreground">…</TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {showRowTruncation && (
        <p className="border-t px-3 py-2 text-center text-xs text-muted-foreground tabular-nums">
          还有 {hiddenRowsCount} 行数据未在预览中显示
          {mode === 'result' ? '（复制或导出时包含全量数据）' : ''}
        </p>
      )}
    </ScrollArea>
  )
}

export default SheetTablePreview
