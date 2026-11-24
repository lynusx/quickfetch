import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { animated, to, useTransition } from '@react-spring/web'
import { X } from 'lucide-react'
import { Box, Dialog, Flex, IconButton } from '@radix-ui/themes'

import { SPRING_SNAPPY, useReducedMotion } from '@/lib/motion'
import { cn } from '@/lib/utils'
import './drawer.css'

export type DrawerSide = 'right' | 'left' | 'bottom'

interface DrawerContextValue {
  open: boolean
  onExitComplete: () => void
}

const DrawerContext = createContext<DrawerContextValue>({
  open: false,
  onExitComplete: () => {},
})

const AnimatedDialogContent = animated(Dialog.Content)

const hiddenOffset = (side: DrawerSide): { x: string; y: string } => {
  switch (side) {
    case 'left':
      return { x: '-100%', y: '0%' }
    case 'bottom':
      return { x: '0%', y: '100%' }
    case 'right':
    default:
      return { x: '100%', y: '0%' }
  }
}

export type DrawerProps = ComponentPropsWithoutRef<typeof Dialog.Root>

/**
 * 抽屉根容器：在 Radix Dialog.Root 基础上向 DrawerContent 透传开关状态，
 * 并保持 Portal 挂载直到 react-spring 滑出动画完成，避免 Radix Presence 提前卸载。
 */
export const Drawer = ({
  open,
  defaultOpen = false,
  onOpenChange,
  children,
  ...props
}: DrawerProps) => {
  const reducedMotion = useReducedMotion()
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen)
  const isControlled = open !== undefined
  const currentOpen = isControlled ? open : uncontrolledOpen

  const [mounted, setMounted] = useState(currentOpen)

  if (currentOpen && !mounted) {
    setMounted(true)
  } else if (!currentOpen && mounted && reducedMotion) {
    setMounted(false)
  }

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next)
      onOpenChange?.(next)
    },
    [isControlled, onOpenChange],
  )

  const onExitComplete = useCallback(() => {
    setMounted(false)
  }, [])

  const contextValue = useMemo(
    () => ({ open: currentOpen, onExitComplete }),
    [currentOpen, onExitComplete],
  )

  return (
    <DrawerContext.Provider value={contextValue}>
      <Dialog.Root {...props} open={mounted} onOpenChange={handleOpenChange}>
        {children}
      </Dialog.Root>
    </DrawerContext.Provider>
  )
}

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
 * 通过 react-spring useTransition 驱动打开滑入与关闭滑出，并在滑出结束后通知根容器卸载。
 */
export const DrawerContent = ({
  side = 'right',
  width = '460px',
  showCloseButton = true,
  className,
  style: userStyle,
  children,
  ...props
}: DrawerContentProps) => {
  const { open, onExitComplete } = useContext(DrawerContext)
  const reducedMotion = useReducedMotion()
  const offset = hiddenOffset(side)

  const transitions = useTransition(open, {
    from: offset,
    enter: { x: '0%', y: '0%' },
    leave: offset,
    config: SPRING_SNAPPY,
    immediate: reducedMotion,
    onDestroyed: (item) => {
      if (item) onExitComplete()
    },
  })

  return transitions((springStyle, item) =>
    item ? (
      <AnimatedDialogContent
        {...props}
        width={side === 'bottom' ? '100%' : width}
        maxWidth={side === 'bottom' ? '100vw' : 'calc(100vw - 32px)'}
        className={cn('drawer-content', className)}
        data-side={side}
        data-closing={!open ? 'true' : undefined}
        style={{
          ...userStyle,
          transform: to(
            [springStyle.x, springStyle.y],
            (x, y) => `translate3d(${x}, ${y}, 0)`,
          ),
        }}
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
      </AnimatedDialogContent>
    ) : null,
  )
}

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
