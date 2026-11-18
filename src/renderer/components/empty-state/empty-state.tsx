import type { ReactNode } from 'react'
import { Box, Flex, Text } from '@radix-ui/themes'

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
    <Text as="p" size="2" weight="medium" align="center">
      {title}
    </Text>
    {description ? (
      <Box maxWidth="380px">
        <Text as="p" size="1" color="gray" align="center">
          {description}
        </Text>
      </Box>
    ) : null}
  </Flex>
)

export default EmptyState
