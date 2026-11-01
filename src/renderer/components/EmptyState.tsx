import type { ReactNode } from 'react'
import { Box, Flex, Text } from '@radix-ui/themes'

interface EmptyStateProps {
  icon: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
}

export const EmptyState = ({
  icon,
  title,
  description,
  action,
}: EmptyStateProps) => (
  <Flex
    className="empty-state"
    direction="column"
    align="center"
    justify="center"
    gap="2"
  >
    <Flex className="empty-icon" align="center" justify="center">
      {icon}
    </Flex>
    <Text as="p" weight="medium" className="empty-title">
      {title}
    </Text>
    {description ? (
      <Text as="p" size="1" color="gray" className="empty-description">
        {description}
      </Text>
    ) : null}
    {action ? <Box className="empty-action">{action}</Box> : null}
  </Flex>
)

export default EmptyState
