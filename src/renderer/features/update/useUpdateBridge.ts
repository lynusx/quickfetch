import { useEffect, useRef } from 'react'

import type { UpdatePhase } from '@shared/ipc'
import { useToast } from '@/hooks/useToast'
import { useUpdateStore } from './updateStore'

/**
 * 全局只挂一次：拉取初始状态并订阅主进程推送。
 *
 * 发现新版本时弹一次 toast；自动检查失败不弹（设置页保留错误），
 * 手动检查的失败由设置页自己根据返回值提示。
 */
export const useUpdateBridge = (): void => {
  const load = useUpdateStore((store) => store.load)
  const applyState = useUpdateStore((store) => store.applyState)
  const phase = useUpdateStore((store) => store.state?.phase)
  const availableVersion = useUpdateStore(
    (store) => store.state?.availableVersion,
  )
  const { showToast } = useToast()
  const previousPhase = useRef<UpdatePhase | null>(null)

  useEffect(() => {
    void load()

    return window.electronAPI.onUpdateState(applyState)
  }, [load, applyState])

  useEffect(() => {
    if (phase === 'available' && previousPhase.current !== 'available') {
      showToast(
        '发现新版本',
        `v${availableVersion ?? ''} 可用，可在设置 → 更新中处理`,
        'info',
      )
    }

    previousPhase.current = phase ?? null
  }, [phase, availableVersion, showToast])
}
