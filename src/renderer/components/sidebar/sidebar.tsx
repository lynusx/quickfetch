import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { PanelLeft } from 'lucide-react'
import {
  Box,
  Flex,
  IconButton,
  ScrollArea,
  Text,
  Tooltip,
} from '@radix-ui/themes'

import { cn } from '@/lib/utils'
import { SidebarContext, useSidebar } from './sidebar-context'
import './sidebar.css'

interface SidebarProviderProps {
  defaultOpen?: boolean
  children: ReactNode
}

/**
 * 侧边栏状态提供者（参考 shadcn/ui Sidebar API，基于 Radix Themes 原语实现）。
 *
 * 默认展开，支持 Ctrl+B / Cmd+B 快捷键在展开态与紧凑图标栏之间切换。
 */
export const SidebarProvider = ({
  defaultOpen = true,
  children,
}: SidebarProviderProps) => {
  const [open, setOpen] = useState(defaultOpen)
  const toggleSidebar = useCallback(() => setOpen((prev) => !prev), [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault()
        toggleSidebar()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggleSidebar])

  const value = useMemo(
    () => ({ open, setOpen, toggleSidebar }),
    [open, toggleSidebar],
  )

  return (
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
  )
}

interface SidebarSectionProps {
  children: ReactNode
  className?: string
}

export const Sidebar = ({ children, className }: SidebarSectionProps) => {
  const { open } = useSidebar()

  return (
    <Flex
      direction="column"
      flexShrink="0"
      height="100%"
      className={cn('sidebar-root', className)}
      data-state={open ? 'expanded' : 'collapsed'}
    >
      {children}
    </Flex>
  )
}

export const SidebarHeader = ({ children, className }: SidebarSectionProps) => (
  <Flex
    align="center"
    justify="between"
    gap="2"
    pt="3"
    px="3"
    pb="4"
    className={cn('sidebar-header', className)}
  >
    {children}
  </Flex>
)

export const SidebarContent = ({
  children,
  className,
}: SidebarSectionProps) => (
  <Box flexGrow="1" minHeight="0" className={className}>
    <ScrollArea
      type="auto"
      size="1"
      scrollbars="vertical"
      role="navigation"
      aria-label="主导航"
    >
      <Box px="3" pt="1" pb="4">
        {children}
      </Box>
    </ScrollArea>
  </Box>
)

export const SidebarGroup = ({ children, className }: SidebarSectionProps) => (
  <Box className={cn('sidebar-group', className)}>{children}</Box>
)

export const SidebarGroupLabel = ({
  children,
  className,
}: SidebarSectionProps) => {
  const { open } = useSidebar()
  if (!open) return null

  return (
    <Text
      as="div"
      size="1"
      weight="medium"
      color="gray"
      mx="2"
      mb="2"
      className={className}
    >
      {children}
    </Text>
  )
}

export const SidebarMenu = ({ children, className }: SidebarSectionProps) => (
  <Flex direction="column" gap="1" className={className}>
    {children}
  </Flex>
)

export const SidebarMenuItem = ({
  children,
  className,
}: SidebarSectionProps) => <Box className={className}>{children}</Box>

interface SidebarMenuButtonProps {
  /** 折叠为图标栏时显示的提示文案 */
  tooltip?: string
  children: ReactNode
}

export const SidebarMenuButton = ({
  tooltip,
  children,
}: SidebarMenuButtonProps) => {
  const { open } = useSidebar()

  if (!open && tooltip) {
    return (
      <Tooltip content={tooltip} side="right">
        {children}
      </Tooltip>
    )
  }

  return <>{children}</>
}

export const SidebarFooter = ({ children, className }: SidebarSectionProps) => (
  <Box className={cn('sidebar-footer', className)} p="3">
    {children}
  </Box>
)

export const SidebarInset = ({ children, className }: SidebarSectionProps) => (
  <Flex
    className={cn('app-main', className)}
    role="main"
    direction="column"
    flexGrow="1"
    flexBasis="0"
    minWidth="0"
    minHeight="0"
    overflow="hidden"
  >
    {children}
  </Flex>
)

export const SidebarTrigger = () => {
  const { open, toggleSidebar } = useSidebar()
  const label = open ? '收起侧边栏 (Ctrl+B)' : '展开侧边栏 (Ctrl+B)'

  return (
    <Tooltip content={label} side="right">
      <IconButton
        type="button"
        variant="ghost"
        color="gray"
        size="1"
        className="sidebar-trigger"
        aria-label={label}
        onClick={toggleSidebar}
      >
        <PanelLeft size={15} strokeWidth={1.75} />
      </IconButton>
    </Tooltip>
  )
}
