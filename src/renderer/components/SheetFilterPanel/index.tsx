import { CheckCheck, CircleSlash } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useExcelStore } from '@/stores/excelStore'
import { useSheetFilterStore } from '@/stores/sheetFilterStore'

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
            <ToggleGroup
              type="multiple"
              variant="outline"
              size="sm"
              value={selectedLines}
              onValueChange={setSelectedLines}
              className="flex flex-wrap gap-1.5"
            >
              {[...lines].map((line) => (
                <ToggleGroupItem key={line} value={line} className="h-8">
                  {line}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
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
            <ToggleGroup
              type="multiple"
              variant="outline"
              size="sm"
              value={selectedDefects}
              onValueChange={setSelectedDefects}
              className="flex flex-wrap gap-1.5"
            >
              {[...defects].map((defect) => (
                <ToggleGroupItem key={defect} value={defect} className="h-8">
                  {defect}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </FieldContent>
        </Field>
      )}
    </FieldGroup>
  )
}

export default SheetFilterPanel
