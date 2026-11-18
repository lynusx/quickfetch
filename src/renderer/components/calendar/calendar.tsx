import type { ComponentProps } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { zhCN } from 'date-fns/locale'
import { DayPicker } from 'react-day-picker'

import { cn } from '@/lib/utils'
import './calendar.css'

export type CalendarProps = ComponentProps<typeof DayPicker>

/**
 * 日历组件（参考 shadcn/ui Calendar API，基于 react-day-picker + Radix 令牌实现）。
 *
 * 默认使用中文区域与外围日期显示，翻月箭头统一采用 lucide-react。
 */
export const Calendar = ({
  className,
  showOutsideDays = true,
  locale = zhCN,
  components,
  ...props
}: CalendarProps) => (
  <DayPicker
    showOutsideDays={showOutsideDays}
    locale={locale}
    className={cn('app-calendar', className)}
    components={{
      Chevron: ({ orientation }) =>
        orientation === 'left' ? (
          <ChevronLeft size={15} strokeWidth={1.75} />
        ) : (
          <ChevronRight size={15} strokeWidth={1.75} />
        ),
      ...components,
    }}
    {...props}
  />
)

export default Calendar
