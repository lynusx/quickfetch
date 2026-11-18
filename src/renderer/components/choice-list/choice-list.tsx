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

import './choice-list.css'

export interface ChoiceOption {
  value: string
  label: ReactNode
  meta?: ReactNode
  title?: string
}

type ChoiceColumns = 1 | 2 | 3 | 4

interface ChoiceBaseProps {
  options: ChoiceOption[]
  columns?: ChoiceColumns
  scroll?: boolean
  disabled?: boolean
  empty?: ReactNode
}

const emptyText = (empty: ReactNode) => (
  <Text size="2" color="gray">
    {empty ?? '没有可选项'}
  </Text>
)

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
    <Grid columns={String(columns) as '1' | '2' | '3' | '4'} gap="2">
      {options.map((option) => {
        const checked = selected.has(option.value)

        return (
          <Flex
            key={option.value}
            className="choice-cell"
            align="center"
            gap="2"
            minWidth="0"
            p="2"
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
            <Box flexGrow="1" minWidth="0">
              <Text
                size="2"
                weight={checked ? 'medium' : 'regular'}
                color={checked ? undefined : 'gray'}
                highContrast={checked || undefined}
                truncate
              >
                {option.label}
              </Text>
            </Box>
            {option.meta != null ? (
              <Box flexShrink="0">
                <Text size="1" color="gray" className="tabular">
                  {option.meta}
                </Text>
              </Box>
            ) : null}
          </Flex>
        )
      })}
    </Grid>
  )

  if (scroll) {
    return (
      <Box maxHeight="222px" className="choice-scroll">
        <ScrollArea type="auto" size="1" scrollbars="vertical">
          <Box p="2">{content}</Box>
        </ScrollArea>
      </Box>
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
      <Grid columns={String(columns) as '1' | '2' | '3' | '4'} gap="2">
        {options.map((option) => {
          const checked = option.value === value

          return (
            <Flex
              key={option.value}
              className="choice-cell"
              align="center"
              gap="2"
              minWidth="0"
              p="2"
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
              <Box flexGrow="1" minWidth="0">
                <Text
                  size="2"
                  weight={checked ? 'medium' : 'regular'}
                  color={checked ? undefined : 'gray'}
                  highContrast={checked || undefined}
                  truncate
                >
                  {option.label}
                </Text>
              </Box>
              {option.meta != null ? (
                <Box flexShrink="0">
                  <Text size="1" color="gray" className="tabular">
                    {option.meta}
                  </Text>
                </Box>
              ) : null}
            </Flex>
          )
        })}
      </Grid>
    </RadioGroup.Root>
  )
}
