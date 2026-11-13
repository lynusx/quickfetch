import type { ReactNode } from 'react'
import { Flex, Heading } from '@radix-ui/themes'

interface PageHeaderProps {
  title: ReactNode
  /** 标题旁的帮助入口，通常是 HelpTip */
  help?: ReactNode
  /** 跟在标题后面的状态徽标 */
  badge?: ReactNode
}

/**
 * 页面标题行。
 *
 * 只负责标题与它旁边的帮助、徽标；吸顶、背景与磨砂由 PageShell 承担。
 * 标题不加样式：`Heading` 自带 margin 0，文字色继承主题根的 gray-12。
 */
export const PageHeader = ({ title, help, badge }: PageHeaderProps) => (
  <Flex align="center" gap="3" wrap="wrap">
    <Heading>{title}</Heading>
    {help}
    {badge}
  </Flex>
)

export default PageHeader
