import { useCallback } from 'react'
import { toast as sonnerToast } from 'sonner'

export type ToastType = 'success' | 'error' | 'info'

/**
 * 兼容原有调用签名（title, description, type）的轻量封装，
 * 实际渲染交给 App 根部的 <Toaster />。
 */
export const useToast = () => {
  const showToast = useCallback(
    (title: string, description: string, type: ToastType = 'info') => {
      const notify =
        type === 'success'
          ? sonnerToast.success
          : type === 'error'
            ? sonnerToast.error
            : sonnerToast.info

      notify(title, { description })
    },
    [],
  )

  return { showToast }
}
