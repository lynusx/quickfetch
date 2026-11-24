import { useEffect, useState } from 'react'
import { animated, useSpring } from '@react-spring/web'
import { Box } from '@radix-ui/themes'

import { SPRING_GENTLE, useReducedMotion } from '@/lib/motion'
import './theme-transition-overlay.css'

const AnimatedBox = animated(Box)

interface ThemeTransitionOverlayProps {
  appearance: 'light' | 'dark'
  /** 设置水合完成后才开启动效，避免冷启动瞬间闪遮罩 */
  ready: boolean
}

/** 读取当前已渲染主题根的画布底色，用于在切换瞬间作为柔和过渡幕 */
const captureCurrentCanvasColor = (): string => {
  const themeRoot = document.querySelector('.radix-themes')
  if (!themeRoot) return 'var(--app-canvas)'

  const computed = getComputedStyle(themeRoot)
  return (
    computed.getPropertyValue('--app-canvas').trim() ||
    computed.backgroundColor ||
    'var(--app-canvas)'
  )
}

/**
 * 明暗主题柔和过渡层：
 *
 * 切换浅色/深色瞬间铺上一层旧主题底色遮罩，由 react-spring（SPRING_GENTLE）
 * 平滑淡出至 0，同时为文档挂上短时 `data-theme-transitioning` 标记，
 * 动画结束后立即卸载遮罩并移除标记，零常驻开销。
 */
export const ThemeTransitionOverlay = ({
  appearance,
  ready,
}: ThemeTransitionOverlayProps) => {
  const reducedMotion = useReducedMotion()
  const [prevAppearance, setPrevAppearance] = useState(appearance)
  const [active, setActive] = useState(false)
  const [overlayBg, setOverlayBg] = useState('var(--app-canvas)')

  if (appearance !== prevAppearance) {
    setPrevAppearance(appearance)

    if (ready && !reducedMotion) {
      setOverlayBg(captureCurrentCanvasColor())
      setActive(true)
    }
  }

  const [spring, api] = useSpring(() => ({
    opacity: 0,
  }))

  useEffect(() => {
    if (!active) return

    const root = document.documentElement
    root.dataset.themeTransitioning = 'true'

    api.start({
      from: { opacity: 0.4 },
      to: { opacity: 0 },
      config: SPRING_GENTLE,
      onRest: () => {
        delete root.dataset.themeTransitioning
        setActive(false)
      },
    })

    return () => {
      delete root.dataset.themeTransitioning
    }
  }, [active, appearance, api])

  if (!active) return null

  return (
    <AnimatedBox
      className="theme-transition-overlay"
      position="fixed"
      inset="0"
      aria-hidden="true"
      style={{
        opacity: spring.opacity,
        backgroundColor: overlayBg,
      }}
    />
  )
}
