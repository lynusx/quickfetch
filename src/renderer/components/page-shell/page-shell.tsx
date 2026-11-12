import type { ReactNode } from 'react'
import { Box, Flex, ScrollArea, Text } from '@radix-ui/themes'

import { PageHeader } from '@/components/page-header/page-header'
import './page-shell.css'

interface PageShellProps {
  title: ReactNode
  /** 标题旁的帮助入口，通常是 HelpTip */
  help?: ReactNode
  /** 跟在标题后面的状态徽标 */
  badge?: ReactNode
  /** 页面引导句，放在正文顶部随内容滚动；不传就不占位 */
  description?: ReactNode
  /** 正文的最大宽度；标题始终贴内容区内边距，不跟随它 */
  contentMaxWidth?: string
  children: ReactNode
}

/**
 * 页面骨架：单一滚动视口 + 吸顶的标题区。
 *
 * 滚动交给 Radix ScrollArea：标题区粘在视口顶部，正文从下方滚过；标题区为
 * 半透明画布色并带背景模糊，内容经过时才呈现磨砂玻璃。滚动条是 overlay，
 * 不占布局宽度，并下移到标题区下方（见 page-shell.css）。标题区高度与滚动
 * 偏移共用 `--app-page-header-height`，标题始终贴内容区的水平内边距，位置
 * 不随窗口宽度变化；正文按自身 max-width 居中。
 */
export const PageShell = ({
  title,
  help,
  badge,
  description,
  contentMaxWidth = 'var(--app-content-max)',
  children,
}: PageShellProps) => (
  <Flex flexGrow="1" flexShrink="1" flexBasis="0" minHeight="0">
    <ScrollArea
      className="page-shell-scroll"
      type="scroll"
      size="2"
      scrollbars="vertical"
    >
      <Box className="page-shell-content">
        <Flex
          className="page-shell-header"
          align="center"
          position="sticky"
          top="0"
          height="var(--app-page-header-height)"
        >
          <Flex align="center" width="100%" px="3">
            <PageHeader title={title} help={help} badge={badge} />
          </Flex>
        </Flex>

        <Box maxWidth={contentMaxWidth} mx="auto" px="3" pt="3" pb="9">
          {description ? (
            <Text
              as="p"
              size="1"
              color="gray"
              className="page-shell-description"
              mb="18px"
            >
              {description}
            </Text>
          ) : null}
          {children}
        </Box>
      </Box>
    </ScrollArea>
  </Flex>
)

export default PageShell
