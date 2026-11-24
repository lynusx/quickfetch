import { useSyncExternalStore } from 'react'
import type { SpringConfig } from '@react-spring/web'

/**
 * 全应用统一的弹簧物理预设（react-spring）。
 *
 * 工具型桌面应用追求「跟手、利落、不拖沓」：采用临界阻尼（clamp: true），
 * 避免多余的回弹过冲干扰高频操作。
 */
export const SPRING_SNAPPY: SpringConfig = {
  tension: 360,
  friction: 34,
  clamp: true,
}

/** 较大面积区块展开/折叠使用的柔和临界阻尼 */
export const SPRING_GENTLE: SpringConfig = {
  tension: 280,
  friction: 30,
  clamp: true,
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

const subscribeReducedMotion = (onStoreChange: () => void): (() => void) => {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return () => {}
  }

  const mql = window.matchMedia(REDUCED_MOTION_QUERY)
  mql.addEventListener('change', onStoreChange)
  return () => mql.removeEventListener('change', onStoreChange)
}

const getReducedMotionSnapshot = (): boolean =>
  typeof window !== 'undefined' &&
  Boolean(window.matchMedia?.(REDUCED_MOTION_QUERY).matches)

/**
 * 响应系统「减少动态效果」无障碍偏好。
 * 开启后所有 react-spring 动效自动切换为 immediate: true。
 */
export const useReducedMotion = (): boolean =>
  useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    () => false,
  )
