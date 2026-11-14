import type { ReactNode } from 'react'
import { Box, Card, Flex, Heading, Text } from '@radix-ui/themes'
import { cn } from '@/lib/utils'

import './panel.css'

interface PanelProps {
  children: ReactNode
  className?: string
}

/**
 * 面板外壳。
 *
 * 背景、描边、圆角与裁剪交给 Radix `Card`（surface 变体），`Card` 没有暴露成
 * prop 的部分（圆角、内边距）由 `.app-card` 用它的变量补齐。
 */
export const Panel = ({ children, className }: PanelProps) => (
  <Card variant="surface" className={cn('app-card', className)}>
    {children}
  </Card>
)

interface PanelHeaderProps {
  title: ReactNode
  description?: ReactNode
  icon?: ReactNode
  actions?: ReactNode
}

export const PanelHeader = ({
  title,
  description,
  icon,
  actions,
}: PanelHeaderProps) => (
  <Flex align="start" justify="between" gap="4" pt="4" px="4">
    <Flex direction="column" minWidth="0">
      <Flex align="center" gap="2">
        {icon ? (
          <Flex
            className="panel-icon"
            align="center"
            justify="center"
            width="22px"
            height="22px"
            flexShrink="0"
          >
            {icon}
          </Flex>
        ) : null}
        <Heading as="h2" size="2">
          {title}
        </Heading>
      </Flex>
      {description ? (
        <Text as="p" size="1" className="panel-description" mt="1">
          {description}
        </Text>
      ) : null}
    </Flex>
    {actions ? (
      <Flex align="center" gap="2" flexShrink="0">
        {actions}
      </Flex>
    ) : null}
  </Flex>
)

interface PanelBodyProps {
  children: ReactNode
}

export const PanelBody = ({ children }: PanelBodyProps) => (
  <Box p="4">{children}</Box>
)

export default Panel
