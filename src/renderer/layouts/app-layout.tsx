import { Box, Flex } from '@radix-ui/themes'
import { Outlet } from 'react-router'

import { SidebarInset, SidebarProvider } from '@/components/sidebar'
import { AppSidebar } from './app-sidebar'
import './app-layout.css'

/**
 * 应用外壳。
 *
 * 顶带承载系统窗口控件（macOS 红绿灯 / Windows 右上角按钮），不显示标题；
 * 侧边栏与顶带共用画布底色，使用 shadcn/ui 风格的 Sidebar 组合原语。
 * 内容区（SidebarInset）是一块白底平面，左贴侧边栏、上贴顶带下沿、
 * 右与下贴窗口边，只保留左上角圆角，页面在内容区内滚动。
 */
const LayoutPage = () => (
  <SidebarProvider>
    <Flex
      className="app-shell"
      direction="column"
      width="100vw"
      height="100vh"
      overflow="hidden"
    >
      <Box
        className="app-topbar"
        aria-hidden="true"
        flexShrink="0"
        flexBasis="var(--app-topbar-height)"
      />
      <Flex className="app-body" flexGrow="1" flexBasis="0" minHeight="0">
        <AppSidebar />
        <SidebarInset>
          <Outlet />
        </SidebarInset>
      </Flex>
    </Flex>
  </SidebarProvider>
)

export default LayoutPage
