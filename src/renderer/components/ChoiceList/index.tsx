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

export interface ChoiceOption {
  value: string
  label: ReactNode
  meta?: ReactNode
  title?: string
}

const COLUMN_MAP = {
  1: '1',
  2: '2',
  3: '3',
  4: '4',
} as const

interface ChoiceBaseProps {
  options: ChoiceOption[]
  columns?: keyof typeof COLUMN_MAP
  scroll?: boolean
  disabled?: boolean
  empty?: ReactNode
}

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

  if (!options.length) {
    return (
      <Text size="2" color="gray">
        {empty ?? '没有可选项'}
      </Text>
    )
  }

  const content = (
    <Grid
      columns={COLUMN_MAP[columns]}
      gap="2"
      style={{
        border: '1px solid var(--gray-6)',
        borderRadius: 'var(--radius-3)',
        padding: 'var(--space-2)',
        backgroundColor: 'var(--color-panel-solid)',
      }}
    >
      {options.map((option) => (
        <Flex
          key={option.value}
          align="center"
          title={option.title}
          px="2"
          py="1"
          style={{
            borderRadius: 'var(--radius-2)',
            userSelect: 'none',
          }}
        >
          <Text
            as="label"
            size="2"
            style={{
              cursor: disabled ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              width: '100%',
              minWidth: 0,
            }}
          >
            <Checkbox
              size="1"
              checked={selected.has(option.value)}
              disabled={disabled}
              onCheckedChange={(checked) =>
                toggle(option.value, checked === true)
              }
            />
            <Text size="2" truncate style={{ flex: 1 }}>
              {option.label}
            </Text>
            {option.meta != null && (
              <Text size="1" color="gray">
                {option.meta}
              </Text>
            )}
          </Text>
        </Flex>
      ))}
    </Grid>
  )

  if (scroll) {
    return (
      <ScrollArea
        scrollbars="vertical"
        style={{
          maxHeight: 220,
          border: '1px solid var(--gray-6)',
          borderRadius: 'var(--radius-3)',
        }}
      >
        <Box p="1">{content}</Box>
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
  if (!options.length) {
    return (
      <Text size="2" color="gray">
        {empty ?? '没有可选项'}
      </Text>
    )
  }

  return (
    <RadioGroup.Root
      size="1"
      value={value}
      disabled={disabled}
      onValueChange={onValueChange}
      style={{
        border: '1px solid var(--gray-6)',
        borderRadius: 'var(--radius-3)',
        padding: 'var(--space-2)',
        backgroundColor: 'var(--color-panel-solid)',
      }}
    >
      <Grid columns={COLUMN_MAP[columns]} gap="2">
        {options.map((option) => (
          <Flex
            key={option.value}
            align="center"
            title={option.title}
            px="2"
            py="1"
            style={{
              borderRadius: 'var(--radius-2)',
              userSelect: 'none',
            }}
          >
            <Text
              as="label"
              size="2"
              style={{
                cursor: disabled ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                width: '100%',
                minWidth: 0,
              }}
            >
              <RadioGroup.Item value={option.value} />
              <Text size="2" truncate style={{ flex: 1 }}>
                {option.label}
              </Text>
              {option.meta != null && (
                <Text size="1" color="gray">
                  {option.meta}
                </Text>
              )}
            </Text>
          </Flex>
        ))}
      </Grid>
    </RadioGroup.Root>
  )
}
