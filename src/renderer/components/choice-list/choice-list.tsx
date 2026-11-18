import type { ReactNode } from 'react'
import {
  Box,
  Checkbox,
  Flex,
  Grid,
  RadioGroup,
  ScrollArea,
  Text,
  Tooltip,
} from '@radix-ui/themes'

import './choice-list.css'

export interface ChoiceOption {
  value: string
  label: ReactNode
  meta?: ReactNode
  title?: string
  /** 悬停提示（Radix Tooltip）；传入时不渲染原生 title，避免双重浮层 */
  tooltip?: ReactNode
}

type ChoiceColumns = 1 | 2 | 3 | 4 | 'auto'
type ChoiceLayout = 'grid' | 'inline'

interface ChoiceBaseProps {
  options: ChoiceOption[]
  columns?: ChoiceColumns
  /** grid: 带边框网格单元格（默认）；inline: 无边框横向排列 */
  layout?: ChoiceLayout
  /** 仅在 layout="inline" 生效：设置每项固定列宽（如 '128px'），按等宽网格对齐 */
  itemWidth?: string
  scroll?: boolean
  /** 滚动容器最大高度，默认 222px */
  scrollMaxHeight?: string
  disabled?: boolean
  empty?: ReactNode
}

const resolveGridColumns = (columns: ChoiceColumns): string =>
  columns === 'auto' ? 'repeat(auto-fill, minmax(175px, 1fr))' : String(columns)

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
  layout = 'grid',
  itemWidth,
  scroll,
  scrollMaxHeight = '222px',
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

  const renderInlineItems = () =>
    options.map((option) => {
      const checked = selected.has(option.value)
      const item = (
        <Text
          as="label"
          key={option.value}
          size="2"
          className="choice-inline"
          data-disabled={disabled || undefined}
          title={option.tooltip ? undefined : option.title}
        >
          <Flex
            as="span"
            display={itemWidth ? 'flex' : 'inline-flex'}
            align="center"
            gap="2"
            minWidth="0"
          >
            <Box as="span" flexShrink="0">
              <Checkbox
                checked={checked}
                disabled={disabled}
                onCheckedChange={(next) => toggle(option.value, next === true)}
              />
            </Box>
            {itemWidth ? (
              <Box as="span" flexGrow="1" minWidth="0">
                <Text
                  as="span"
                  size="2"
                  weight={checked ? 'medium' : 'regular'}
                  color={checked ? undefined : 'gray'}
                  highContrast={checked || undefined}
                  truncate
                >
                  {option.label}
                </Text>
              </Box>
            ) : (
              <Text
                as="span"
                size="2"
                weight={checked ? 'medium' : 'regular'}
                color={checked ? undefined : 'gray'}
                highContrast={checked || undefined}
              >
                {option.label}
              </Text>
            )}
            {option.meta != null ? (
              <Text as="span" size="2" color="gray" className="tabular">
                {option.meta}
              </Text>
            ) : null}
          </Flex>
        </Text>
      )

      return option.tooltip ? (
        <Tooltip
          key={option.value}
          content={option.tooltip}
          delayDuration={250}
        >
          {item}
        </Tooltip>
      ) : (
        item
      )
    })

  const content =
    layout === 'inline' ? (
      itemWidth ? (
        <Grid columns={`repeat(auto-fill, ${itemWidth})`} gapX="3" gapY="2">
          {renderInlineItems()}
        </Grid>
      ) : (
        <Flex wrap="wrap" align="center" gapX="4" gapY="2">
          {renderInlineItems()}
        </Flex>
      )
    ) : (
      <Grid columns={resolveGridColumns(columns)} gap="2">
        {options.map((option) => {
          const checked = selected.has(option.value)
          const item = (
            <Flex
              key={option.value}
              className="choice-cell"
              align="center"
              gap="2"
              minWidth="0"
              p="2"
              data-selected={checked || undefined}
              data-disabled={disabled || undefined}
              title={option.tooltip ? undefined : option.title}
              onClick={() => {
                if (disabled) return
                toggle(option.value, !checked)
              }}
            >
              <Checkbox
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

          return option.tooltip ? (
            <Tooltip
              key={option.value}
              content={option.tooltip}
              delayDuration={250}
            >
              {item}
            </Tooltip>
          ) : (
            item
          )
        })}
      </Grid>
    )

  if (scroll) {
    return (
      <Flex
        direction="column"
        maxHeight={scrollMaxHeight}
        className="choice-scroll"
      >
        <ScrollArea type="auto" size="1" scrollbars="vertical">
          <Box p="3">{content}</Box>
        </ScrollArea>
      </Flex>
    )
  }

  return content
}

export const ChoiceRadio = ({
  options,
  value,
  onValueChange,
  columns = 2,
  layout = 'grid',
  disabled,
  empty,
}: ChoiceBaseProps & {
  value: string
  onValueChange: (value: string) => void
}) => {
  if (!options.length) return emptyText(empty)

  return (
    <RadioGroup.Root
      value={value}
      disabled={disabled}
      onValueChange={onValueChange}
    >
      {layout === 'inline' ? (
        <Flex wrap="wrap" align="center" gapX="4" gapY="2">
          {options.map((option) => {
            const checked = option.value === value

            return (
              <Text
                as="label"
                key={option.value}
                size="2"
                className="choice-inline"
                data-disabled={disabled || undefined}
                title={option.title}
              >
                <Flex as="span" display="inline-flex" align="center" gap="2">
                  <RadioGroup.Item value={option.value} />
                  <Text
                    as="span"
                    size="2"
                    weight={checked ? 'medium' : 'regular'}
                    color={checked ? undefined : 'gray'}
                    highContrast={checked || undefined}
                  >
                    {option.label}
                  </Text>
                  {option.meta != null ? (
                    <Text as="span" size="2" color="gray" className="tabular">
                      ({option.meta})
                    </Text>
                  ) : null}
                </Flex>
              </Text>
            )
          })}
        </Flex>
      ) : (
        <Grid columns={resolveGridColumns(columns)} gap="2">
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
                    typeof option.label === 'string'
                      ? option.label
                      : option.value
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
      )}
    </RadioGroup.Root>
  )
}
