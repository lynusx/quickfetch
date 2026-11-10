import type { ReactNode } from 'react'
import { Box, Flex, Heading, Text } from '@radix-ui/themes'

import './page-header.css'

interface PageHeaderProps {
  /** 侧边栏分组对应的短标签，如「找图 · EL」 */
  eyebrow?: string
  title: ReactNode
  description?: ReactNode
  /** 标题旁的帮助入口，通常是 HelpTip */
  help?: ReactNode
  /** 跟在标题后面的状态徽标 */
  badge?: ReactNode
  actions?: ReactNode
}

/**
 * 页面级标题区。
 *
 * 顶部栏不再重复页面标题；标题只由内容区出现一次。
 * 现在外壳不再渲染标题，页头只在这里出现一次。
 */
export const PageHeader = ({
  eyebrow,
  title,
  description,
  help,
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
        {help}
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
