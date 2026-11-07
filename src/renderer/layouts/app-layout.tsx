import { Box, Flex } from '@radix-ui/themes'
import { Outlet } from 'react-router'

import { AppSidebar } from './app-sidebar'
import './app-layout.css'

/**
 * 应用外壳。
 *
 * 顶带承载系统窗口控件（macOS 红绿灯 / Windows 右上角按钮），不显示标题；
 * 侧边栏与四周留白共用应用底色，内容区是一张固定浮起的卡片，页面在卡片内滚动。
 * 页面标题统一由各页的 PageHeader 渲染。
 */
const LayoutPage = () => (
  <Flex className="app-shell" direction="column">
    <Box className="app-topbar" aria-hidden="true" />
    <Flex className="app-body">
      <AppSidebar />
      <Box className="app-main" role="main">
        <Box className="app-content">
          <Outlet />
        </Box>
      </Box>
    </Flex>
  </Flex>
)

export default LayoutPage
