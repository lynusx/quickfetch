import { useEffect, useRef, useState } from 'react'
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
 * 页面骨架：内容区顶部留白 + 随内容滚动、到顶吸顶的标题。
 *
 * 标题属于滚动内容，不单独占一行固定栏：页首 24px 让它先随正文上移，
 * 移到内容区顶部后由 sticky 固定。标题底色取自内容区（白色半透明），
 * 正文从下方穿过时才呈现磨砂玻璃；吸顶后由哨兵元素触发一条下边框，
 * 静止时与内容区完全融为一体。滚动条占满内容区高度；键盘聚焦的元素
 * 靠 scroll-padding-top 让开标题。标题与正文共用水平内边距，正文按
 * 自身 max-width 居中。
 */
export const PageShell = ({
  title,
  help,
  badge,
  description,
  contentMaxWidth = 'var(--app-content-max)',
  children,
}: PageShellProps) => {
  const viewportRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [stuck, setStuck] = useState(false)

  // 哨兵滚出视口顶部即标题已吸顶；只用于切换下边框
  useEffect(() => {
    const root = viewportRef.current
    const sentinel = sentinelRef.current
    if (!root || !sentinel) return

    const observer = new IntersectionObserver(
      ([entry]) => setStuck(!entry.isIntersecting),
      { root },
    )
    observer.observe(sentinel)

    return () => observer.disconnect()
  }, [])

  return (
    <Flex flexGrow="1" flexShrink="1" flexBasis="0" minHeight="0">
      <ScrollArea
        ref={viewportRef}
        className="page-shell-scroll"
        type="scroll"
        size="2"
        scrollbars="vertical"
      >
        <Box className="page-shell-content" pt="5">
          {/* 标题到达内容区顶部的标记，不渲染任何内容 */}
          <Box ref={sentinelRef} height="1px" aria-hidden="true" />

          <Flex
            className="page-shell-header"
            data-stuck={stuck ? 'true' : undefined}
            align="center"
            position="sticky"
            top="0"
            height="var(--app-page-header-height)"
            px="4"
          >
            <PageHeader title={title} help={help} badge={badge} />
          </Flex>

          <Box maxWidth={contentMaxWidth} mx="auto" px="4" pt="3" pb="9">
            {description ? (
              <Text as="p" size="1" className="page-shell-description" mb="4">
                {description}
              </Text>
            ) : null}
            {children}
          </Box>
        </Box>
      </ScrollArea>
    </Flex>
  )
}

export default PageShell
