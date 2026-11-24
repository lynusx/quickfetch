import { useEffect, useRef } from 'react'
import { animated, useSpring } from '@react-spring/web'
import { Box, Flex } from '@radix-ui/themes'
import { Outlet, useLocation } from 'react-router'

import { SidebarInset, SidebarProvider } from '@/components/sidebar'
import { SPRING_SNAPPY, useReducedMotion } from '@/lib/motion'
import { AppSidebar } from './app-sidebar'
import './app-layout.css'

const AnimatedFlex = animated(Flex)

/**
 * 路由切页轻量进场容器：每次切换侧边栏页面时播放极短淡入 + 6px 上移；
 * 静止态自动还原 transform: none，避免给后代 fixed/sticky 元素制造新的包含块。
 */
const AnimatedOutlet = () => {
  const { pathname } = useLocation()
  const reducedMotion = useReducedMotion()
  const prevPathRef = useRef(pathname)

  const [spring, api] = useSpring(() => ({
    opacity: 1,
    y: 0,
  }))

  useEffect(() => {
    if (prevPathRef.current === pathname) return
    prevPathRef.current = pathname

    if (reducedMotion) {
      api.set({ opacity: 1, y: 0 })
      return
    }

    api.start({
      from: { opacity: 0, y: 6 },
      to: { opacity: 1, y: 0 },
      config: SPRING_SNAPPY,
    })
  }, [pathname, reducedMotion, api])

  return (
    <AnimatedFlex
      direction="column"
      flexGrow="1"
      flexBasis="0"
      minHeight="0"
      style={{
        opacity: spring.opacity,
        transform: spring.y.to((v) =>
          v === 0 ? 'none' : `translate3d(0, ${v}px, 0)`,
        ),
      }}
    >
      <Outlet />
    </AnimatedFlex>
  )
}

/**
 * 应用外壳。
 *
 * 顶带承载系统窗口控件（macOS 红绿灯 / Windows 右上角按钮），不显示标题；
 * 侧边栏与顶带共用画布底色，使用 shadcn/ui 风格的 Sidebar 组合原语。
 * 内容区（SidebarInset）是一块白底平面，左贴侧边栏、上贴顶带下沿、
 * 右与下贴窗口边，只保留左上角圆角，页面在内容区内滚动。
 */
const LayoutPage = () => (
  <SidebarProvider>
    <Flex
      className="app-shell"
      direction="column"
      width="100vw"
      height="100vh"
      overflow="hidden"
    >
      <Box
        className="app-topbar"
        aria-hidden="true"
        flexShrink="0"
        flexBasis="var(--app-topbar-height)"
      />
      <Flex className="app-body" flexGrow="1" flexBasis="0" minHeight="0">
        <AppSidebar />
        <SidebarInset>
          <AnimatedOutlet />
        </SidebarInset>
      </Flex>
    </Flex>
  </SidebarProvider>
)

export default LayoutPage
