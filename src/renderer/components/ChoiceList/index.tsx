import type { ReactNode } from 'react'
import {
  Box,
  Checkbox,
  Flex,
  Grid,
  RadioGroup,
  ScrollArea,
  Text,
} from '@radix-ui/themes'
import { cn } from '@/lib/utils'

import './ChoiceList.css'

export interface ChoiceOption {
  value: string
  label: ReactNode
  meta?: ReactNode
  title?: string
}

const COLUMN_CLASS = {
  1: 'choice-cols-1',
  2: 'choice-cols-2',
  3: 'choice-cols-3',
  4: 'choice-cols-4',
} as const

interface ChoiceBaseProps {
  options: ChoiceOption[]
  columns?: keyof typeof COLUMN_CLASS
  scroll?: boolean
  disabled?: boolean
  empty?: ReactNode
}

const emptyText = (empty: ReactNode) => (
  <Text size="2" color="gray">
    {empty ?? '没有可选项'}
  </Text>
)

const gridClass = (columns: keyof typeof COLUMN_CLASS) =>
  cn('choice-grid', COLUMN_CLASS[columns])

export const ChoiceList = ({
  options,
  value,
  onValueChange,
  columns = 1,
  scroll,
  disabled,
  empty,
}: ChoiceBaseProps & {
  value: string[]
  onValueChange: (value: string[]) => void
}) => {
  const selected = new Set(value)

  const toggle = (optionValue: string, checked: boolean) => {
    if (checked) selected.add(optionValue)
    else selected.delete(optionValue)

    const known = new Set(options.map((item) => item.value))
    const ordered = options
      .filter((item) => selected.has(item.value))
      .map((item) => item.value)
    const extra = value.filter((item) => selected.has(item) && !known.has(item))

    onValueChange([...ordered, ...extra])
  }

  if (!options.length) return emptyText(empty)

  const content = (
    <Grid className={gridClass(columns)} gap="2">
      {options.map((option) => {
        const checked = selected.has(option.value)

        return (
          <Flex
            key={option.value}
            className="choice-cell"
            align="center"
            gap="2"
            data-selected={checked || undefined}
            data-disabled={disabled || undefined}
            title={option.title}
            onClick={() => {
              if (disabled) return
              toggle(option.value, !checked)
            }}
          >
            <Checkbox
              size="1"
              checked={checked}
              disabled={disabled}
              aria-label={
                typeof option.label === 'string' ? option.label : option.value
              }
              onClick={(event) => event.stopPropagation()}
              onCheckedChange={(next) => toggle(option.value, next === true)}
            />
            <Text as="span" size="2" className="choice-label">
              {option.label}
            </Text>
            {option.meta != null ? (
              <Text as="span" size="1" color="gray" className="choice-meta">
                {option.meta}
              </Text>
            ) : null}
          </Flex>
        )
      })}
    </Grid>
  )

  if (scroll) {
    return (
      <ScrollArea type="auto" scrollbars="vertical" className="choice-scroll">
        <Box className="choice-scroll-inner">{content}</Box>
      </ScrollArea>
    )
  }

  return content
}

export const ChoiceRadio = ({
  options,
  value,
  onValueChange,
  columns = 2,
  disabled,
  empty,
}: ChoiceBaseProps & {
  value: string
  onValueChange: (value: string) => void
}) => {
  if (!options.length) return emptyText(empty)

  return (
    <RadioGroup.Root
      size="1"
      value={value}
      disabled={disabled}
      onValueChange={onValueChange}
    >
      <Grid className={gridClass(columns)} gap="2">
        {options.map((option) => {
          const checked = option.value === value

          return (
            <Flex
              key={option.value}
              className="choice-cell"
              align="center"
              gap="2"
              data-selected={checked || undefined}
              data-disabled={disabled || undefined}
              title={option.title}
              onClick={() => {
                if (disabled) return
                onValueChange(option.value)
              }}
            >
              <RadioGroup.Item
                value={option.value}
                aria-label={
                  typeof option.label === 'string' ? option.label : option.value
                }
                onClick={(event) => event.stopPropagation()}
              />
              <Text as="span" size="2" className="choice-label">
                {option.label}
              </Text>
              {option.meta != null ? (
                <Text as="span" size="1" color="gray" className="choice-meta">
                  {option.meta}
                </Text>
              ) : null}
            </Flex>
          )
        })}
      </Grid>
    </RadioGroup.Root>
  )
}
