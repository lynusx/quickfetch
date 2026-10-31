import { TableIcon } from '@radix-ui/react-icons'
import { Flex, Heading, ScrollArea, Table, Text } from '@radix-ui/themes'

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
      <Flex
        direction="column"
        align="center"
        justify="center"
        gap="2"
        py="6"
        style={{ minHeight: 240 }}
      >
        <TableIcon width={28} height={28} style={{ color: 'var(--gray-8)' }} />
        <Heading size="3">暂无可显示的数据</Heading>
        <Text size="1" color="gray">
          调整筛选条件后再试
        </Text>
      </Flex>
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
    <ScrollArea type="auto" scrollbars="both" style={{ maxHeight }}>
      <Table.Root size="1" variant="surface">
        <Table.Header
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 1,
            backgroundColor: 'var(--color-panel-solid)',
          }}
        >
          <Table.Row>
            {headerRow.map((cell, index) => (
              <Table.ColumnHeaderCell
                key={index}
                style={{ whiteSpace: 'nowrap' }}
              >
                {cell}
              </Table.ColumnHeaderCell>
            ))}
            {showColTruncation && (
              <Table.ColumnHeaderCell
                style={{
                  whiteSpace: 'nowrap',
                  color: 'var(--gray-9)',
                }}
              >
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
                  style={{
                    whiteSpace: 'nowrap',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {cell}
                </Table.Cell>
              ))}
              {showColTruncation && (
                <Table.Cell style={{ color: 'var(--gray-9)' }}>…</Table.Cell>
              )}
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>

      {showRowTruncation && (
        <Text
          as="p"
          align="center"
          size="1"
          color="gray"
          style={{
            borderTop: '1px solid var(--gray-4)',
            fontVariantNumeric: 'tabular-nums',
            padding: '8px 0',
          }}
        >
          还有 {hiddenRowsCount} 行数据未在预览中显示
          {mode === 'result' ? '（复制或导出时包含全量数据）' : ''}
        </Text>
      )}
    </ScrollArea>
  )
}

export default SheetTablePreview
