import type { ReactNode } from 'react'
import { Box, Flex, Heading, Text } from '@radix-ui/themes'

import './PageHeader.css'

interface PageHeaderProps {
  /** 侧边栏分组对应的短标签，如「找图 · EL」 */
  eyebrow?: string
  title: ReactNode
  description?: ReactNode
  /** 跟在标题后面的状态徽标 */
  badge?: ReactNode
  actions?: ReactNode
}

/**
 * 页面级标题区。
 *
 * 旧版顶部栏只重复了一遍页面标题，真正的标题又出现在内容里，等于占了两行。
 * 现在外壳不再渲染标题，页头只在这里出现一次。
 */
export const PageHeader = ({
  eyebrow,
  title,
  description,
  badge,
  actions,
}: PageHeaderProps) => (
  <Flex className="page-header">
    <Box className="page-header-main">
      {eyebrow ? (
        <Text
          as="div"
          size="1"
          weight="medium"
          color="gray"
          className="page-eyebrow"
        >
          {eyebrow}
        </Text>
      ) : null}
      <Flex className="page-title-row" align="center" gap="2" wrap="wrap">
        <Heading as="h1" className="page-title">
          {title}
        </Heading>
        {badge}
      </Flex>
      {description ? (
        <Text as="p" size="1" color="gray" className="page-description">
          {description}
        </Text>
      ) : null}
    </Box>
    {actions ? (
      <Flex className="page-actions" align="center" gap="2">
        {actions}
      </Flex>
    ) : null}
  </Flex>
)

export default PageHeader
