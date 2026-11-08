import { useEffect, useState } from 'react'

// 读不到时仍然给一个显眼的值：preload 没加载或产物不完整时，
// 显示 0.0.0 比空白更容易在真机上被发现。
const FALLBACK_VERSION = '0.0.0'

/**
 * 运行时向主进程取应用版本（app.getVersion()）。
 *
 * 不在构建时内联 package.json —— 版本只保留一个来源，
 * 安装包名、asar 内 package.json 与界面显示天然一致。
 */
export const useAppVersion = (): string | null => {
  const [version, setVersion] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    window.electronAPI
      .getVersion()
      .then((next) => {
        if (!cancelled) setVersion(next || FALLBACK_VERSION)
      })
      .catch((error) => {
        console.warn('读取应用版本失败:', error)
        if (!cancelled) setVersion(FALLBACK_VERSION)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return version
}
