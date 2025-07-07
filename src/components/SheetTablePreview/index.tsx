import type { FC } from 'react'
import type { ExcelSheet } from '../../hooks/useExcelUpload'
import { Flex, ScrollArea, Table, Text } from '@radix-ui/themes'

interface SheetTablePreviewProps {
  sheet: ExcelSheet
  mode: 'result' | 'original'
}

const SheetTablePreview: FC<SheetTablePreviewProps> = ({ sheet, mode }) => {
  const maxRows = 20
  const maxCols = 10

  let displayData = sheet.data
  let showRowTruncation = false
  let showColTruncation = false

  if (sheet.data.length === 0) {
    return (
      <Flex align="center" justify="center" height="100%">
        <Text size="3">暂无可显示的数据</Text>
      </Flex>
    )
  }

  if (mode === 'original') {
    if (sheet.rowCount > maxRows) {
      displayData = displayData.slice(0, maxRows)
      showRowTruncation = true
    }

    if (sheet.colCount > maxCols) {
      displayData = displayData.map((row) => row.slice(0, maxCols))
      showColTruncation = true
    }
  }

  const headerRow = displayData[0]
  const dataRows = displayData.slice(1)

  return (
    <ScrollArea>
      <Table.Root>
        <Table.Header>
          <Table.Row>
            {headerRow.map((cell, index) => (
              <Table.ColumnHeaderCell key={index}>
                <Text size="2" weight="medium">
                  {cell}
                </Text>
              </Table.ColumnHeaderCell>
            ))}
            {showColTruncation && (
              <Table.ColumnHeaderCell>
                <Text size="2" weight="medium">
                  ...还有{sheet.colCount - maxCols}列
                </Text>
              </Table.ColumnHeaderCell>
            )}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {dataRows.map((row, rowIndex) => (
            <Table.Row key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <Table.Cell key={cellIndex}>
                  <Text size="2">{cell}</Text>
                </Table.Cell>
              ))}
              {showColTruncation && (
                <Table.Cell>
                  <Text size="2">...</Text>
                </Table.Cell>
              )}
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
      {showRowTruncation && (
        <Flex justify="center" align="center" py="2">
          <Text size="2" weight="medium">
            ...还有{sheet.rowCount - maxRows}行数据
          </Text>
        </Flex>
      )}
    </ScrollArea>
  )
}

export default SheetTablePreview
