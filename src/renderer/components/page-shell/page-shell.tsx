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
  /** 标题栏右侧操作区，与左侧标题两端对齐 */
  actions?: ReactNode
  /** 页面引导句，放在正文顶部随内容滚动；不传就不占位 */
  description?: ReactNode
  /** 正文与标题栏共用的最大宽度 */
  contentMaxWidth?: string
  children: ReactNode
}

/**
 * 页面骨架：吸顶标题 + 单一滚动视口。
 *
 * 标题栏贴内容区顶部，吸顶底色与磨砂底边框铺满内容区全宽，
 * 内部标题与操作区和下方正文共用同一 `contentMaxWidth` 居中对齐，
 * 避免宽屏下标题贴边、正文缩在中间的视觉断层。
 */
export const PageShell = ({
  title,
  help,
  badge,
  actions,
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
        <Box className="page-shell-content">
          {/* 标题到达内容区顶部的标记，不渲染任何内容 */}
          <Box ref={sentinelRef} height="1px" aria-hidden="true" />

          <Flex
            className="page-shell-header"
            data-stuck={stuck ? 'true' : undefined}
            align="center"
            position="sticky"
            top="0"
            height="var(--app-page-header-height)"
          >
            <Flex
              align="center"
              justify="between"
              gap="3"
              width="100%"
              maxWidth={contentMaxWidth}
              mx="auto"
              px="4"
            >
              <PageHeader title={title} help={help} badge={badge} />
              {actions ? (
                <Flex align="center" gap="2" minWidth="0" flexShrink="0">
                  {actions}
                </Flex>
              ) : null}
            </Flex>
          </Flex>

          <Box maxWidth={contentMaxWidth} mx="auto" px="4" pt="3" pb="9">
            {description ? (
              <Text as="p" size="1" color="gray" mb="4">
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
