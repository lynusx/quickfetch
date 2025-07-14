import { Outlet } from 'react-router'
import { Container, Flex } from '@radix-ui/themes'

import Sidebar from '../../components/Sidebar'

import './index.css'

const LayoutPage = () => {
  return (
    <Flex
      minHeight="100vh"
      justify="center"
      align="start"
      className="layout-page-container"
    >
      <Flex className="app-main-container">
        {/* 左侧导航 */}
        <Sidebar />

        {/* 右侧内容区域 */}
        <Flex direction="column" flexGrow="1" className="content-area">
          <Container size="4" p="4" className="content-container">
            {/* 内容视图 */}
            <Outlet />
          </Container>
        </Flex>
      </Flex>
    </Flex>
  )
}

export default LayoutPage
