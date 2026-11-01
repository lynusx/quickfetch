import { useMemo, useState } from 'react'
import { CalendarIcon } from '@radix-ui/react-icons'
import { Button, Flex, Popover, Separator, Text } from '@radix-ui/themes'
import { zhCN } from 'date-fns/locale'
import { DayPicker } from 'react-day-picker'

import './date-picker.css'

export interface DatePickerProps {
  /** 格式为 YYYYMMDD 或 YYYY-MM-DD 的日期字符串 */
  value?: string
  /** 选中日期变更回调，输出 YYYYMMDD 格式字符串 */
  onChange: (value: string) => void
  /** 按钮尺寸，默认为 '2' */
  size?: '1' | '2' | '3'
  /** 是否禁用 */
  disabled?: boolean
  /** 未选择时的占位提示 */
  placeholder?: string
  /** 自定义行内样式 */
  style?: React.CSSProperties
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

export const DatePicker = ({
  value,
  onChange,
  size = '2',
  disabled = false,
  placeholder = '选择日期',
  style,
}: DatePickerProps) => {
  const [open, setOpen] = useState(false)

  const selectedDate = useMemo(() => parseDateString(value), [value])

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
          size={size}
          disabled={disabled}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            gap: 'var(--space-2)',
            width: '100%',
            fontFamily: 'var(--code-font-family)',
            cursor: disabled ? 'not-allowed' : 'pointer',
            ...style,
          }}
        >
          <CalendarIcon
            width={14}
            height={14}
            style={{ color: 'var(--gray-11)', flexShrink: 0 }}
          />
          <Text
            size={size}
            style={{
              color: selectedDate ? 'var(--gray-12)' : 'var(--gray-9)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {displayText}
          </Text>
        </Button>
      </Popover.Trigger>

      <Popover.Content
        size="1"
        align="start"
        style={{
          padding: 'var(--space-2)',
          borderRadius: 'var(--radius-3)',
        }}
      >
        <Flex direction="column" gap="2">
          {/* 快捷选项 */}
          <Flex align="center" justify="between" gap="2" px="1">
            <Button
              type="button"
              variant="ghost"
              color="gray"
              size="1"
              onClick={() => selectShortcut(0)}
            >
              今天
            </Button>
            <Button
              type="button"
              variant="ghost"
              color="gray"
              size="1"
              onClick={() => selectShortcut(-1)}
            >
              昨天
            </Button>
            <Button
              type="button"
              variant="ghost"
              color="gray"
              size="1"
              onClick={() => selectShortcut(-2)}
            >
              前天
            </Button>
          </Flex>

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
