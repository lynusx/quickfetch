import { Container, Flex } from '@radix-ui/themes'

import SidebarNavigation from '../../components/SidebarNavigation'
import NavViewContainer from '../../components/NavViewContainer'

import './index.css'

const RootPage = () => {
  return (
    <Flex
      minHeight="100vh"
      justify="center"
      align="start"
      className="root-page-container"
    >
      <Flex className="app-main-container">
        {/* 左侧导航 */}
        <SidebarNavigation />

        {/* 右侧内容区域 */}
        <Flex direction="column" flexGrow="1" className="content-area">
          <Container size="4" p="4" className="content-container">
            {/* 内容视图 */}
            <NavViewContainer />
          </Container>
        </Flex>
      </Flex>
    </Flex>
  )
}

export default RootPage
