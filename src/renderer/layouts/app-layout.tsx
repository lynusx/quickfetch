import { Box, Flex } from '@radix-ui/themes'
import { Outlet } from 'react-router'

import { AppSidebar } from './app-sidebar'
import './app-layout.css'

/**
 * 应用外壳。
 *
 * 只负责「顶部拖拽带 + 侧边栏 + 滚动内容区」：顶带承载系统窗口控件
 * （macOS 红绿灯 / Windows 右上角按钮），不显示标题；页面标题统一由
 * 各页的 PageHeader 渲染。
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
