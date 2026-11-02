import { CheckIcon, CircleBackslashIcon } from '@radix-ui/react-icons'
import { Button, Flex } from '@radix-ui/themes'

import { ChoiceList } from '@/components/choice-list'
import { Field } from '@/components/field'
import { useExcelStore } from '../stores/excelStore'
import { useSheetFilterStore } from '../stores/sheetFilterStore'

const EMPTY_SHEET = { name: '', data: [], rowCount: 0, colCount: 0 }

const SheetFilterPanel = () => {
  const {
    lines,
    defects,
    selectedLines,
    selectedDefects,
    setSelectedLines,
    setSelectedDefects,
  } = useSheetFilterStore()
  const { setSheet } = useExcelStore()

  const clearLines = () => {
    setSelectedLines([])
    setSheet(EMPTY_SHEET)
  }

  const clearDefects = () => {
    setSelectedDefects([])
    setSheet(EMPTY_SHEET)
  }

  const lineOptions = Array.from(lines).map((line) => ({
    value: line,
    label: line,
  }))

  const defectOptions = Array.from(defects).map((defect) => ({
    value: defect,
    label: defect,
  }))

  return (
    <Flex direction="column" gap="4">
      {lines.size > 0 ? (
        <Field
          label="线别"
          count={`${selectedLines.length}/${lines.size}`}
          actions={
            <>
              <Button
                type="button"
                variant="ghost"
                color="gray"
                size="1"
                disabled={selectedLines.length === 0}
                onClick={clearLines}
              >
                <CircleBackslashIcon width={12} height={12} />
                清空
              </Button>
              <Button
                type="button"
                variant="ghost"
                color="gray"
                size="1"
                onClick={() => setSelectedLines([...lines])}
              >
                <CheckIcon width={12} height={12} />
                全选
              </Button>
            </>
          }
        >
          <ChoiceList
            columns={lines.size > 4 ? 3 : lines.size > 2 ? 2 : 1}
            value={selectedLines}
            onValueChange={setSelectedLines}
            options={lineOptions}
          />
        </Field>
      ) : null}

      {defects.size > 0 ? (
        <Field
          label="不良项"
          count={`${selectedDefects.length}/${defects.size}`}
          actions={
            <>
              <Button
                type="button"
                variant="ghost"
                color="gray"
                size="1"
                disabled={selectedDefects.length === 0}
                onClick={clearDefects}
              >
                <CircleBackslashIcon width={12} height={12} />
                清空
              </Button>
              <Button
                type="button"
                variant="ghost"
                color="gray"
                size="1"
                onClick={() => setSelectedDefects([...defects])}
              >
                <CheckIcon width={12} height={12} />
                全选
              </Button>
            </>
          }
        >
          <ChoiceList
            columns={2}
            scroll={defects.size > 8}
            value={selectedDefects}
            onValueChange={setSelectedDefects}
            options={defectOptions}
          />
        </Field>
      ) : null}
    </Flex>
  )
}

export default SheetFilterPanel
