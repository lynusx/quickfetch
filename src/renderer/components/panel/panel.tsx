import type { CSSProperties, ReactNode } from 'react'
import { Box, Flex, Heading, Text } from '@radix-ui/themes'
import { cn } from '@/lib/utils'

import './panel.css'

interface PanelProps {
  children: ReactNode
  className?: string
  style?: CSSProperties
  /** 需要表格或列表自己贴边时去掉内边距 */
  flush?: boolean
}

export const Panel = ({ children, className, style, flush }: PanelProps) => (
  <Box
    className={cn('panel', className)}
    style={style}
    data-flush={flush || undefined}
  >
    {children}
  </Box>
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
  <Flex className="panel-header">
    <Box className="panel-header-main">
      <Flex className="panel-title-row" align="center" gap="2">
        {icon ? (
          <Flex className="panel-icon" align="center" justify="center">
            {icon}
          </Flex>
        ) : null}
        <Heading as="h2" className="panel-title">
          {title}
        </Heading>
      </Flex>
      {description ? (
        <Text as="p" size="1" color="gray" className="panel-description">
          {description}
        </Text>
      ) : null}
    </Box>
    {actions ? (
      <Flex className="panel-actions" align="center" gap="1">
        {actions}
      </Flex>
    ) : null}
  </Flex>
)

interface PanelBodyProps {
  children: ReactNode
  className?: string
}

export const PanelBody = ({ children, className }: PanelBodyProps) => (
  <Box className={cn('panel-body', className)}>{children}</Box>
)

export default Panel
