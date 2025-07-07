import { useCallback, useState } from 'react'

export const useToast = () => {
  const [toast, setToast] = useState<{
    open: boolean
    title?: string
    description?: string
    type?: 'info' | 'success' | 'error'
  }>({ open: false })

  const showToast = useCallback(
    (
      title: string,
      description: string,
      type?: 'info' | 'success' | 'error',
    ) => {
      setToast({ open: true, title, description, type })
    },
    [],
  )

  const hideToast = useCallback(() => {
    setToast({ open: false })
  }, [])

  return { toast, showToast, hideToast }
}
