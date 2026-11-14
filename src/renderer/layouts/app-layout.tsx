import { Box, Flex } from '@radix-ui/themes'
import { Outlet } from 'react-router'

import { AppSidebar } from './app-sidebar'
import './app-layout.css'

/**
 * 应用外壳。
 *
 * 顶带承载系统窗口控件（macOS 红绿灯 / Windows 右上角按钮），不显示标题；
 * 侧边栏与顶带共用画布底色。内容区是一块白底平面，左贴侧边栏、上贴顶带
 * 下沿、右与下贴窗口边，只保留左上角圆角，页面在内容区内滚动。
 * 页面骨架（随内容滚动并吸顶的标题 + 正文）统一由各页的 PageShell 渲染。
 */
const LayoutPage = () => (
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
      flexBasis="40px"
    />
    <Flex
      className="app-body"
      flexGrow="1"
      flexBasis="0"
      minHeight="0"
      overflow="hidden"
    >
      <AppSidebar />
      <Flex
        className="app-main"
        role="main"
        direction="column"
        flexGrow="1"
        flexBasis="0"
        minWidth="0"
        minHeight="0"
        overflow="hidden"
      >
        <Outlet />
      </Flex>
    </Flex>
  </Flex>
)

export default LayoutPage
