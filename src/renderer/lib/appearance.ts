import { useEffect, useSyncExternalStore } from 'react'

import type { ThemeAppearance } from '@shared/ipc'

const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)'

const subscribeSystemDark = (onChange: () => void): (() => void) => {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}

  const mq = window.matchMedia(DARK_MEDIA_QUERY)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

const getSystemDarkSnapshot = (): boolean => {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia(DARK_MEDIA_QUERY).matches
}

/**
 * 将用户偏好的明暗选项（system / light / dark）解析为实际生效的 `'light' | 'dark'`，
 * 并同步写入文档 `color-scheme`，让原生滚动条与日期控件跟随切换。
 */
export const useResolvedAppearance = (
  appearance: ThemeAppearance,
): 'light' | 'dark' => {
  const systemDark = useSyncExternalStore(
    subscribeSystemDark,
    getSystemDarkSnapshot,
    () => false,
  )

  const resolved: 'light' | 'dark' =
    appearance === 'system' ? (systemDark ? 'dark' : 'light') : appearance

  useEffect(() => {
    document.documentElement.style.colorScheme = resolved
  }, [resolved])

  return resolved
}
