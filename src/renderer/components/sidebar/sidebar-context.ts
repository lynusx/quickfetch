import { createContext, useContext } from 'react'

export interface SidebarContextValue {
  open: boolean
  setOpen: (open: boolean) => void
  toggleSidebar: () => void
}

export const SidebarContext = createContext<SidebarContextValue | null>(null)

export const useSidebar = (): SidebarContextValue => {
  const ctx = useContext(SidebarContext)
  if (!ctx) {
    throw new Error('useSidebar must be used within a SidebarProvider.')
  }
  return ctx
}
