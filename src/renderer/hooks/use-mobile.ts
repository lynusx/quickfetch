import * as React from 'react'

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  // 首帧直接读窗口宽度：渲染层只跑在 Electron 里，没有 SSR 的窗口缺失问题，
  // 这样也不必在 effect 里补一次 setState（那会多一轮渲染并触发 lint 告警）
  const [isMobile, setIsMobile] = React.useState(
    () => window.innerWidth < MOBILE_BREAKPOINT,
  )

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return isMobile
}
