import type { ReactNode } from 'react'

import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'

/**
 * 勾选列表：多选用 Checkbox，单选用 RadioGroup，行结构完全一致。
 *
 * 之所以不用 ToggleGroup（一排按钮），是因为本主题里 `bg-muted` 与页面白底
 * 的对比度只有 1.11:1，选中与未选几乎看不出区别；而勾选框的选中态是
 * `bg-primary` 实心填充（6.8:1），隔着工位屏幕也能一眼分清。
 */
export interface ChoiceOption {
  value: string
  label: ReactNode
  /** 名称右侧的次要信息，例如机台数量、图片张数 */
  meta?: ReactNode
  /** 悬停提示，例如机台的真实共享地址 */
  title?: string
}

const COLUMNS = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
} as const

interface ChoiceBaseProps {
  options: ChoiceOption[]
  /** 1–4 列；名字长的一列，纯数字或短名可以排密一点 */
  columns?: keyof typeof COLUMNS
  /** 选项多到几十条时给固定高度并滚动 */
  scroll?: boolean
  disabled?: boolean
  className?: string
  /** 没有可选项时显示的文案 */
  empty?: ReactNode
}

const listClass = (
  columns: keyof typeof COLUMNS,
  scroll?: boolean,
  className?: string,
): string =>
  cn(
    'grid w-full gap-x-3 gap-y-0.5 rounded-lg border p-1.5',
    COLUMNS[columns],
    scroll && 'max-h-56 overflow-y-auto',
    className,
  )

interface ChoiceRowProps {
  option: ChoiceOption
  control: ReactNode
}

const ChoiceRow = ({ option, control }: ChoiceRowProps) => (
  <div
    className="flex min-w-0 items-center rounded px-1.5 py-1 hover:bg-muted/60"
    title={option.title}
  >
    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-xs">
      {control}
      <span className="min-w-0 flex-1 truncate">{option.label}</span>
      {option.meta != null && (
        <span className="shrink-0 text-muted-foreground tabular-nums">
          {option.meta}
        </span>
      )}
    </label>
  </div>
)

const EmptyHint = ({ children }: { children: ReactNode }) => (
  <p className="text-xs text-muted-foreground">{children}</p>
)

export const ChoiceList = ({
  options,
  value,
  onValueChange,
  columns = 1,
  scroll,
  disabled,
  className,
  empty,
}: ChoiceBaseProps & {
  value: string[]
  onValueChange: (value: string[]) => void
}) => {
  const selected = new Set(value)

  const toggle = (optionValue: string, checked: boolean) => {
    if (checked) selected.add(optionValue)
    else selected.delete(optionValue)

    // 回写时按选项顺序排，勾选后列表不会跟着点击顺序跳；
    // 选项里没有的旧值（切厂区前选的机台）挂在末尾，不静默丢掉
    const known = new Set(options.map((item) => item.value))
    const ordered = options
      .filter((item) => selected.has(item.value))
      .map((item) => item.value)
    const extra = value.filter((item) => selected.has(item) && !known.has(item))

    onValueChange([...ordered, ...extra])
  }

  if (!options.length) return <EmptyHint>{empty ?? '没有可选项'}</EmptyHint>

  return (
    <div className={listClass(columns, scroll, className)}>
      {options.map((option) => (
        <ChoiceRow
          key={option.value}
          option={option}
          control={
            <Checkbox
              checked={selected.has(option.value)}
              disabled={disabled}
              // 未选中时默认只有一个很浅的灰底（与白底 1.25:1），
              // 补一圈边框才能看出这里是可以点的框
              className="border-muted-foreground/40"
              onCheckedChange={(state) => toggle(option.value, state === true)}
            />
          }
        />
      ))}
    </div>
  )
}

export const ChoiceRadio = ({
  options,
  value,
  onValueChange,
  columns = 2,
  disabled,
  className,
  empty,
}: ChoiceBaseProps & {
  value: string
  onValueChange: (value: string) => void
}) => {
  if (!options.length) return <EmptyHint>{empty ?? '没有可选项'}</EmptyHint>

  return (
    <RadioGroup
      value={value}
      disabled={disabled}
      onValueChange={onValueChange}
      className={listClass(columns, false, className)}
    >
      {options.map((option) => (
        <ChoiceRow
          key={option.value}
          option={option}
          control={<RadioGroupItem value={option.value} />}
        />
      ))}
    </RadioGroup>
  )
}
