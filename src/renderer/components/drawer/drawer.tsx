import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { X } from 'lucide-react'
import { Box, Dialog, Flex, IconButton } from '@radix-ui/themes'

import { cn } from '@/lib/utils'
import './drawer.css'

export type DrawerSide = 'right' | 'left' | 'bottom'

export const Drawer = Dialog.Root
export const DrawerTrigger = Dialog.Trigger
export const DrawerClose = Dialog.Close

interface DrawerContentProps extends Omit<
  ComponentPropsWithoutRef<typeof Dialog.Content>,
  'maxWidth'
> {
  /** 滑出方向，桌面端默认右侧 */
  side?: DrawerSide
  /** 侧边抽屉宽度，仅在 right / left 生效 */
  width?: string
  /** 是否在右上角渲染关闭按钮，默认开启 */
  showCloseButton?: boolean
  children: ReactNode
}

/**
 * 抽屉容器（参考 shadcn/ui Drawer/Sheet API，基于 Radix Themes Dialog 实现）。
 *
 * 复用 Radix Dialog 的焦点陷阱、Esc 关闭、遮罩与 Portal 能力，
 * 样式走 Radix 设计令牌，无额外手势库依赖。
 */
export const DrawerContent = ({
  side = 'right',
  width = '460px',
  showCloseButton = true,
  className,
  children,
  ...props
}: DrawerContentProps) => (
  <Dialog.Content
    {...props}
    width={side === 'bottom' ? '100%' : width}
    maxWidth={side === 'bottom' ? '100vw' : 'calc(100vw - 32px)'}
    className={cn('drawer-content', className)}
    data-side={side}
  >
    {showCloseButton ? (
      <Box position="absolute" top="4" right="4" className="drawer-close">
        <Dialog.Close>
          <IconButton
            type="button"
            variant="ghost"
            color="gray"
            size="1"
            aria-label="关闭"
          >
            <X size={15} strokeWidth={1.75} />
          </IconButton>
        </Dialog.Close>
      </Box>
    ) : null}
    {children}
  </Dialog.Content>
)

interface DrawerSectionProps {
  children: ReactNode
  className?: string
}

export const DrawerHeader = ({ children, className }: DrawerSectionProps) => (
  <Flex
    direction="column"
    gap="1"
    px="5"
    pt="5"
    pb="3"
    pr="8"
    flexShrink="0"
    className={cn('drawer-header', className)}
  >
    {children}
  </Flex>
)

export const DrawerTitle = ({
  children,
  ...props
}: ComponentPropsWithoutRef<typeof Dialog.Title>) => (
  <Dialog.Title mb="0" size="4" {...props}>
    {children}
  </Dialog.Title>
)

export const DrawerDescription = ({
  children,
  ...props
}: ComponentPropsWithoutRef<typeof Dialog.Description>) => (
  <Dialog.Description size="1" color="gray" {...props}>
    {children}
  </Dialog.Description>
)

export const DrawerBody = ({ children, className }: DrawerSectionProps) => (
  <Flex
    direction="column"
    flexGrow="1"
    minHeight="0"
    px="5"
    py="4"
    className={className}
  >
    {children}
  </Flex>
)

export const DrawerFooter = ({ children, className }: DrawerSectionProps) => (
  <Flex
    align="center"
    justify="between"
    gap="3"
    px="5"
    py="3"
    flexShrink="0"
    className={cn('drawer-footer', className)}
  >
    {children}
  </Flex>
)
