import { Box, Flex } from '@radix-ui/themes'
import { Outlet } from 'react-router'

import { AppSidebar } from './AppSidebar'

/**
 * 应用外壳。
 *
 * 只负责「侧边栏 + 滚动内容区」，页面标题统一由各页的 PageHeader 渲染，
 * 外壳不再重复一层标题栏。
 */
const LayoutPage = () => (
  <Flex className="app-shell">
    <AppSidebar />
    <Box className="app-main" role="main">
      <Box className="app-content">
        <Outlet />
      </Box>
    </Box>
  </Flex>
)

export default LayoutPage
