import { CheckCheck, CircleSlash } from 'lucide-react'

import { ChoiceList } from '@/components/ChoiceList'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
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
    <FieldGroup>
      {lines.size > 0 && (
        <Field>
          <div className="flex items-center justify-between gap-2">
            <FieldLabel className="mb-0">
              线别
              <span className="font-normal text-muted-foreground tabular-nums">
                {selectedLines.length}/{lines.size}
              </span>
            </FieldLabel>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={selectedLines.length === 0}
                onClick={clearLines}
              >
                <CircleSlash data-icon="inline-start" />
                清空
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setSelectedLines([...lines])}
              >
                <CheckCheck data-icon="inline-start" />
                全选
              </Button>
            </div>
          </div>
          <FieldContent>
            <ChoiceList
              columns={lines.size > 4 ? 3 : lines.size > 2 ? 2 : 1}
              value={selectedLines}
              onValueChange={setSelectedLines}
              options={lineOptions}
            />
          </FieldContent>
        </Field>
      )}

      {defects.size > 0 && (
        <Field>
          <div className="flex items-center justify-between gap-2">
            <FieldLabel className="mb-0">
              不良项
              <span className="font-normal text-muted-foreground tabular-nums">
                {selectedDefects.length}/{defects.size}
              </span>
            </FieldLabel>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={selectedDefects.length === 0}
                onClick={clearDefects}
              >
                <CircleSlash data-icon="inline-start" />
                清空
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setSelectedDefects([...defects])}
              >
                <CheckCheck data-icon="inline-start" />
                全选
              </Button>
            </div>
          </div>
          <FieldContent>
            <ChoiceList
              columns={2}
              scroll={defects.size > 8}
              value={selectedDefects}
              onValueChange={setSelectedDefects}
              options={defectOptions}
            />
          </FieldContent>
        </Field>
      )}
    </FieldGroup>
  )
}

export default SheetFilterPanel
