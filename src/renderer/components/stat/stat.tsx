import type { ReactNode } from 'react'
import { Flex, Grid, Text } from '@radix-ui/themes'

import './stat.css'

type StatTone = 'default' | 'accent' | 'success' | 'danger'

interface StatProps {
  label: string
  value: ReactNode
  unit?: string
  tone?: StatTone
}

export const Stat = ({ label, value, unit, tone = 'default' }: StatProps) => (
  <Flex className="stat" data-tone={tone} direction="column">
    <Text as="span" size="1" color="gray" className="stat-label">
      {label}
    </Text>
    <Text as="span" className="stat-value">
      {value}
      {unit ? (
        <Text as="span" size="1" color="gray" className="stat-unit">
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
