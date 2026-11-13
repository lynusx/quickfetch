import { useMemo, useState } from 'react'
import { CalendarIcon } from '@radix-ui/react-icons'
import {
  Badge,
  Button,
  Flex,
  Grid,
  Popover,
  Separator,
  Text,
} from '@radix-ui/themes'
import { zhCN } from 'date-fns/locale'
import { DayPicker } from 'react-day-picker'

import './date-picker.css'

export interface DatePickerProps {
  /** 格式为 YYYYMMDD 或 YYYY-MM-DD 的日期字符串 */
  value?: string
  /** 选中日期变更回调，输出 YYYYMMDD 格式字符串 */
  onChange: (value: string) => void
  /** 是否禁用 */
  disabled?: boolean
  /** 未选择时的占位提示 */
  placeholder?: string
}

/** 将 YYYYMMDD 或 YYYY-MM-DD 解析为本地 Date 对象（避免时区换算跨天） */
const parseDateString = (val?: string): Date | undefined => {
  if (!val) return undefined

  const cleaned = val.replace(/-/g, '').trim()
  if (cleaned.length !== 8) return undefined

  const year = Number.parseInt(cleaned.slice(0, 4), 10)
  const month = Number.parseInt(cleaned.slice(4, 6), 10) - 1
  const day = Number.parseInt(cleaned.slice(6, 8), 10)

  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    return undefined
  }

  const date = new Date(year, month, day)
  return Number.isNaN(date.getTime()) ? undefined : date
}

/** 将 Date 格式化为 YYYYMMDD 字符串 */
const formatToYYYYMMDD = (d: Date): string => {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

/** 将 Date 格式化为 YYYY-MM-DD 展示字符串 */
const formatDisplay = (d: Date): string => {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** 「今天 / 昨天 / 前天」，其他日期不额外标注 */
const relativeLabel = (date?: Date): string | null => {
  if (!date) return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(date)
  target.setHours(0, 0, 0, 0)

  const days = Math.round((target.getTime() - today.getTime()) / 86400000)
  if (days === 0) return '今天'
  if (days === -1) return '昨天'
  if (days === -2) return '前天'
  return null
}

export const DatePicker = ({
  value,
  onChange,
  disabled = false,
  placeholder = '选择日期',
}: DatePickerProps) => {
  const [open, setOpen] = useState(false)

  const selectedDate = useMemo(() => parseDateString(value), [value])
  const relative = relativeLabel(selectedDate)
  const displayText = selectedDate ? formatDisplay(selectedDate) : placeholder

  const handleSelect = (nextDate?: Date) => {
    if (!nextDate) return
    onChange(formatToYYYYMMDD(nextDate))
    setOpen(false)
  }

  const selectShortcut = (offsetDays: number) => {
    const target = new Date()
    target.setDate(target.getDate() + offsetDays)
    onChange(formatToYYYYMMDD(target))
    setOpen(false)
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger>
        <Button
          type="button"
          variant="surface"
          color="gray"
          className="date-trigger"
          disabled={disabled}
          aria-label={`选择日期，当前 ${displayText}`}
        >
          <CalendarIcon width={14} height={14} />
          <Text
            size="2"
            color={selectedDate ? undefined : 'gray'}
            className="date-trigger-text"
          >
            {displayText}
          </Text>
          {relative ? (
            <Badge size="1" color="indigo" variant="soft">
              {relative}
            </Badge>
          ) : null}
        </Button>
      </Popover.Trigger>

      <Popover.Content size="1" align="start" className="date-popover">
        <Flex direction="column" gap="2">
          {/* 快捷选项 */}
          <Grid className="date-shortcuts" columns="3" gap="1">
            <Button
              type="button"
              variant="ghost"
              color="gray"
              size="1"
              className="date-shortcut"
              onClick={() => selectShortcut(0)}
            >
              今天
            </Button>
            <Button
              type="button"
              variant="ghost"
              color="gray"
              size="1"
              className="date-shortcut"
              onClick={() => selectShortcut(-1)}
            >
              昨天
            </Button>
            <Button
              type="button"
              variant="ghost"
              color="gray"
              size="1"
              className="date-shortcut"
              onClick={() => selectShortcut(-2)}
            >
              前天
            </Button>
          </Grid>

          <Separator size="4" />

          {/* 日历面板 */}
          <DayPicker
            mode="single"
            selected={selectedDate}
            onSelect={handleSelect}
            defaultMonth={selectedDate ?? new Date()}
            locale={zhCN}
          />
        </Flex>
      </Popover.Content>
    </Popover.Root>
  )
}

export default DatePicker
