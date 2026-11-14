import type { ReactNode } from 'react'
import { Flex, Text } from '@radix-ui/themes'

import './empty-state.css'

interface EmptyStateProps {
  icon: ReactNode
  title: ReactNode
  description?: ReactNode
}

export const EmptyState = ({ icon, title, description }: EmptyStateProps) => (
  <Flex
    className="empty-state"
    direction="column"
    align="center"
    justify="center"
    gap="2"
    py="6"
    px="4"
  >
    <Flex
      className="empty-icon"
      align="center"
      justify="center"
      width="42px"
      height="42px"
      mb="1"
    >
      {icon}
    </Flex>
    <Text as="p" size="2" weight="medium">
      {title}
    </Text>
    {description ? (
      <Text as="p" size="1" className="empty-description">
        {description}
      </Text>
    ) : null}
  </Flex>
)

export default EmptyState
