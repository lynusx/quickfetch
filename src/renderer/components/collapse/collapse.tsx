import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { animated, useSpring } from '@react-spring/web'
import { Box } from '@radix-ui/themes'

import { SPRING_GENTLE, useReducedMotion } from '@/lib/motion'

const AnimatedBox = animated(Box)

interface CollapseProps {
  /** 是否处于展开态 */
  open: boolean
  /** 收起完成后是否卸载子节点；默认保留以便快速二次展开 */
  unmountOnExit?: boolean
  children: ReactNode
}

/**
 * 自适应高度平滑折叠容器（基于 react-spring + ResizeObserver）。
 *
 * - 展开静止态自动回切 `height: auto` 与 `overflow: visible`，
 *   避免内部表单动态增高或焦点环/阴影被裁切；
 * - 收起态设置 `inert` 与 `aria-hidden`，防止键盘 Tab 落入隐藏控件；
 * - 自动遵循系统 `prefers-reduced-motion` 偏好。
 */
export const Collapse = ({
  open,
  unmountOnExit = false,
  children,
}: CollapseProps) => {
  const reducedMotion = useReducedMotion()
  const contentRef = useRef<HTMLDivElement>(null)
  const openRef = useRef(open)
  const isFirstRender = useRef(true)

  const [prevOpen, setPrevOpen] = useState(open)
  const [mounted, setMounted] = useState(open || !unmountOnExit)
  const [settledOpen, setSettledOpen] = useState(open)

  // open 变化时在渲染阶段同步派生挂载与静止态，避免在 effect 中同步 setState
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setMounted(true)
      setSettledOpen(reducedMotion)
    } else {
      setSettledOpen(false)
      if (reducedMotion && unmountOnExit) {
        setMounted(false)
      }
    }
  }

  const [spring, api] = useSpring(() => ({
    height: open ? ('auto' as number | 'auto') : 0,
    opacity: open ? 1 : 0,
  }))

  useLayoutEffect(() => {
    openRef.current = open

    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }

    if (reducedMotion) {
      api.set({ height: open ? 'auto' : 0, opacity: open ? 1 : 0 })
      return
    }

    const el = contentRef.current
    const measured = el ? el.scrollHeight : 0

    if (open) {
      api.start({
        to: { height: measured, opacity: 1 },
        config: SPRING_GENTLE,
        onRest: (result) => {
          if (result.finished && openRef.current) {
            api.set({ height: 'auto' })
            setSettledOpen(true)
          }
        },
      })
    } else {
      // 从 'auto' 收起前先锁定当前实测像素高度，确保弹簧从真实高度出发
      if (spring.height.get() === 'auto') {
        api.set({ height: measured })
      }
      api.start({
        to: { height: 0, opacity: 0 },
        config: SPRING_GENTLE,
        onRest: (result) => {
          if (result.finished && !openRef.current && unmountOnExit) {
            setMounted(false)
          }
        },
      })
    }
  }, [open, reducedMotion, unmountOnExit, api, spring.height])

  // 展开动画进行中若子内容高度动态变化，同步更新目标高度
  useEffect(() => {
    const el = contentRef.current
    if (!el || !open || settledOpen || reducedMotion) return

    const observer = new ResizeObserver(() => {
      if (openRef.current && !settledOpen) {
        api.start({
          to: { height: el.scrollHeight },
          config: SPRING_GENTLE,
        })
      }
    })
    observer.observe(el)

    return () => observer.disconnect()
  }, [open, settledOpen, reducedMotion, api])

  if (!mounted) return null

  return (
    <AnimatedBox
      overflow={settledOpen && open ? 'visible' : 'hidden'}
      aria-hidden={!open || undefined}
      inert={!open}
      style={spring}
    >
      <Box ref={contentRef}>{children}</Box>
    </AnimatedBox>
  )
}

export default Collapse
