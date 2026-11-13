import { TableIcon } from '@radix-ui/react-icons'
import { Box, ScrollArea, Table, Text } from '@radix-ui/themes'

import { EmptyState } from '@/components/empty-state/empty-state'
import type { ExcelSheet } from '../types'

interface SheetTablePreviewProps {
  sheet: ExcelSheet
  mode: 'result' | 'original'
}

const MAX_ORIGINAL_ROWS = 20
const MAX_RESULT_ROWS = 100
const MAX_COLS = 10

const SheetTablePreview = ({ sheet, mode }: SheetTablePreviewProps) => {
  if (sheet.data.length === 0) {
    return (
      <EmptyState
        icon={<TableIcon width={18} height={18} />}
        title="暂无可显示的数据"
        description="调整筛选条件后再试。"
      />
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
    <ScrollArea type="auto" scrollbars="both">
      <Table.Root size="1" variant="surface">
        <Table.Header>
          <Table.Row>
            {headerRow.map((cell, index) => (
              <Table.ColumnHeaderCell key={index} className="sheet-cell-nowrap">
                {cell}
              </Table.ColumnHeaderCell>
            ))}
            {showColTruncation && (
              <Table.ColumnHeaderCell className="sheet-cell-nowrap sheet-cell-muted">
                还有 {sheet.colCount - MAX_COLS} 列
              </Table.ColumnHeaderCell>
            )}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {dataRows.map((row, rowIndex) => (
            <Table.Row key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <Table.Cell
                  key={cellIndex}
                  className="sheet-cell-nowrap sheet-cell-number"
                >
                  {cell}
                </Table.Cell>
              ))}
              {showColTruncation && (
                <Table.Cell className="sheet-cell-muted">…</Table.Cell>
              )}
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>

      {showRowTruncation && (
        <Box className="sheet-footer" py="2">
          <Text as="p" align="center" size="1" color="gray" className="tabular">
            还有 {hiddenRowsCount} 行数据未在预览中显示
            {mode === 'result' ? '（复制或导出时包含全量数据）' : ''}
          </Text>
        </Box>
      )}
    </ScrollArea>
  )
}

export default SheetTablePreview
