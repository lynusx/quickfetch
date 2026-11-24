import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useSpring } from '@react-spring/web'

import type { ThemeAppearance, UiDensity, UiScale } from '@shared/ipc'
import { SPRING_GENTLE, useReducedMotion } from './motion'

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

const applyDensityProgress = (progress: number): void => {
  const root = document.documentElement

  if (progress <= 0.001) {
    delete root.dataset.densityActive
    root.style.setProperty('--app-density-t', '0')
    return
  }

  root.dataset.densityActive = 'true'
  root.style.setProperty('--app-density-t', progress.toFixed(4))
}

/**
 * 使用 react-spring 连续插值密度因子（0 = 舒适，1 = 紧凑），
 * 通过单个 CSS 变量 `--app-density-t` 驱动全应用与 Portal 弹层间距平滑伸缩。
 *
 * 首屏水合阶段直接落定目标值，避免冷启动时误播动画。
 */
export const useApplyDensity = (density: UiDensity, ready: boolean): void => {
  const reducedMotion = useReducedMotion()
  const hydratedRef = useRef(false)
  const target = density === 'compact' ? 1 : 0

  const [, api] = useSpring(() => ({
    progress: target,
    onChange: (result) => {
      const value = result.value.progress as number
      applyDensityProgress(value)
    },
    onRest: (result) => {
      const value = result.value.progress as number
      applyDensityProgress(value)
    },
  }))

  useEffect(() => {
    document.documentElement.dataset.density = density

    if (!ready) return

    const immediate = !hydratedRef.current || reducedMotion
    hydratedRef.current = true

    if (immediate) {
      api.set({ progress: target })
      applyDensityProgress(target)
      return
    }

    api.start({
      to: { progress: target },
      config: SPRING_GENTLE,
    })
  }, [density, ready, reducedMotion, target, api])
}

const applyZoomFactor = (factor: number): void => {
  window.electronAPI?.setZoomFactor?.(factor)
  document.documentElement.style.setProperty('--app-zoom', factor.toFixed(4))
}

/**
 * 使用 react-spring 连续插值界面缩放倍率，同进程同步调用
 * `webFrame.setZoomFactor` 并同步 `--app-zoom` 反向补偿 40 DIP 顶带高度。
 *
 * 首屏水合阶段直接落定目标值，避免冷启动时误播动画。
 */
export const useApplyScale = (scale: UiScale, ready: boolean): void => {
  const reducedMotion = useReducedMotion()
  const hydratedRef = useRef(false)
  const target = scale / 100

  const [, api] = useSpring(() => ({
    factor: target,
    onChange: (result) => {
      const value = result.value.factor as number
      applyZoomFactor(value)
    },
    onRest: (result) => {
      const value = result.value.factor as number
      applyZoomFactor(value)
    },
  }))

  useEffect(() => {
    if (!ready) return

    const immediate = !hydratedRef.current || reducedMotion
    hydratedRef.current = true

    if (immediate) {
      api.set({ factor: target })
      applyZoomFactor(target)
      return
    }

    api.start({
      to: { factor: target },
      config: SPRING_GENTLE,
    })
  }, [scale, ready, reducedMotion, target, api])
}
