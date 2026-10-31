import { Outlet, useLocation } from 'react-router'
import { Box, Flex, Heading, Text } from '@radix-ui/themes'
import { AppSidebar } from './AppSidebar'

const PAGE_TITLES: Record<string, string> = {
  '/image-copy': 'EL 图片扫描',
  '/lxt': '力禧特图片扫描',
  '/pl': '利珀图片扫描',
  '/excel-parse': 'Excel 解析',
  '/settings': '设置',
}

const LayoutPage = () => {
  const { pathname } = useLocation()
  const currentTitle = PAGE_TITLES[pathname] ?? '工作台'

  return (
    <Flex style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <AppSidebar />

      <Flex
        direction="column"
        style={{ flex: 1, minWidth: 0, height: '100vh' }}
      >
        <Flex
          align="center"
          gap="2"
          px="4"
          style={{
            height: 52,
            minHeight: 52,
            backgroundColor: 'var(--color-background)',
            borderBottom: '1px solid var(--gray-6)',
          }}
        >
          <Text size="2" color="gray">
            工具
          </Text>
          <Text size="2" color="gray">
            /
          </Text>
          <Heading size="3">{currentTitle}</Heading>
        </Flex>

        <Box
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 'var(--space-5)',
            backgroundColor: 'var(--gray-1)',
          }}
        >
          <Box style={{ maxWidth: 1400, margin: '0 auto' }}>
            <Outlet />
          </Box>
        </Box>
      </Flex>
    </Flex>
  )
}

export default LayoutPage
