import type { ReactNode } from 'react'
import { Box, Flex, Text } from '@radix-ui/themes'

import { cn } from '@/lib/utils'
import './empty.css'

interface EmptyProps {
  children: ReactNode
  className?: string
}

/**
 * 空状态组合组件族（参考 shadcn/ui Empty API，基于 Radix Themes 原语实现）。
 *
 * 组合方式：Empty > EmptyHeader (EmptyMedia + EmptyTitle + EmptyDescription) + EmptyContent?
 */
export const Empty = ({ children, className }: EmptyProps) => (
  <Flex
    direction="column"
    align="center"
    justify="center"
    gap="3"
    py="6"
    px="4"
    className={cn('empty-root', className)}
  >
    {children}
  </Flex>
)

export const EmptyHeader = ({ children, className }: EmptyProps) => (
  <Flex direction="column" align="center" gap="2" className={className}>
    {children}
  </Flex>
)

interface EmptyMediaProps extends EmptyProps {
  variant?: 'default' | 'icon'
}

export const EmptyMedia = ({
  children,
  variant = 'icon',
  className,
}: EmptyMediaProps) => (
  <Flex
    align="center"
    justify="center"
    width={variant === 'icon' ? '40px' : undefined}
    height={variant === 'icon' ? '40px' : undefined}
    mb="1"
    className={cn('empty-media', className)}
    data-variant={variant}
  >
    {children}
  </Flex>
)

export const EmptyTitle = ({ children, className }: EmptyProps) => (
  <Text as="p" size="2" weight="medium" align="center" className={className}>
    {children}
  </Text>
)

export const EmptyDescription = ({ children, className }: EmptyProps) => (
  <Box maxWidth="380px" className={className}>
    <Text as="p" size="1" color="gray" align="center">
      {children}
    </Text>
  </Box>
)

export const EmptyContent = ({ children, className }: EmptyProps) => (
  <Flex direction="column" align="center" gap="2" className={className}>
    {children}
  </Flex>
)
