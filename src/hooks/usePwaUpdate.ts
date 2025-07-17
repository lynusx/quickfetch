import { useState, useEffect } from 'react'

const usePwaUpdate = () => {
  const [pwaUpdate, setPwaUpdate] = useState(false)

  useEffect(() => {
    // 确保在支持 serviceWorker 的环境中运行
    if (!('serviceWorker' in navigator)) return

    let isMounted = true
    let registration: ServiceWorkerRegistration | null = null
    let installingWorker: ServiceWorker | null = null

    const handleStateChange = () => {
      // 检查组件是否已卸载
      if (!isMounted) return

      // 检查安装状态和服务工作者控制器
      if (
        installingWorker?.state === 'installed' &&
        navigator.serviceWorker.controller
      ) {
        setPwaUpdate(true)
      }
    }

    const handleUpdateFound = () => {
      installingWorker =
        registration?.installing || registration?.waiting || null

      if (!installingWorker) return

      // 添加状态变化监听
      installingWorker.addEventListener('statechange', handleStateChange)
    }

    navigator.serviceWorker
      .getRegistration()
      .then((reg) => {
        if (!reg) return
        registration = reg

        // 监听更新事件
        reg.addEventListener('updatefound', handleUpdateFound)

        // 检查是否已有等待安装的 worker
        if (reg.waiting && navigator.serviceWorker.controller) {
          setPwaUpdate(true)
        }
      })
      .catch((error) => {
        console.error('Service Worker 注册错误:', error)
      })

    // 清理函数
    return () => {
      isMounted = false

      // 移除事件监听
      if (registration) {
        registration.removeEventListener('updatefound', handleUpdateFound)
      }

      if (installingWorker) {
        installingWorker.removeEventListener('statechange', handleStateChange)
      }
    }
  }, [])

  return { pwaUpdate, setPwaUpdate }
}

export default usePwaUpdate
