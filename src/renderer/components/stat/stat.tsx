import type { ReactNode } from 'react'
import { Flex, Grid, Text } from '@radix-ui/themes'

import './stat.css'

type StatTone = 'default' | 'accent' | 'success' | 'danger'

/**
 * 语气 → Radix 颜色；改色调只改这张表，不用去翻 CSS 选择器。
 *
 * `Text` 的 color 只接受具名色阶，没有「跟随主题强调色」的选项，
 * 所以这里写死 `indigo`——改 `app.tsx` 的 `accentColor` 时必须同步改这一行，
 * 否则「命中图片」这一格会跟主题脱节。
 */
const TONE_COLOR: Record<StatTone, 'indigo' | 'green' | 'red' | undefined> = {
  default: undefined,
  accent: 'indigo',
  success: 'green',
  danger: 'red',
}

interface StatProps {
  label: string
  value: ReactNode
  unit?: string
  tone?: StatTone
}

export const Stat = ({ label, value, unit, tone = 'default' }: StatProps) => (
  <Flex className="stat" direction="column" gap="1" minWidth="0" p="3">
    <Text as="div" size="1" weight="medium" className="stat-label">
      {label}
    </Text>
    <Text
      as="div"
      size="5"
      weight="bold"
      color={TONE_COLOR[tone] ?? 'gray'}
      highContrast={tone === 'default' ? true : undefined}
      truncate
      className="tabular"
    >
      {value}
      {unit ? (
        <Text as="span" size="1" weight="medium" ml="1" className="stat-unit">
          {unit}
        </Text>
      ) : null}
    </Text>
  </Flex>
)

export const StatGrid = ({ children }: { children: ReactNode }) => (
  <Grid className="stat-grid" gap="2">
    {children}
  </Grid>
)

export default Stat
