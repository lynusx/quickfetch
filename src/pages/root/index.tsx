import { Box, Container, Flex } from '@radix-ui/themes'

import SiderbarNavigation from './sidebar-navigation'
import NavViewContainer from './nav-view-container'

const RootPage = () => {
  return (
    <Box style={{ minHeight: '100vh', background: 'var(--gray-1)' }}>
      <Flex>
        {/* 左侧导航 */}
        <SiderbarNavigation />

        {/* 右侧内容区域 */}
        <Box
          flexGrow="1"
          style={{
            background: 'var(--gray-1)',
            minHeight: '100vh',
            borderLeft: '1px solid var(--gray-6)',
          }}
        >
          <Container size="4" p="6">
            {/* 内容视图 */}
            <NavViewContainer />
          </Container>
        </Box>
      </Flex>
    </Box>
  )
}

export default RootPage
