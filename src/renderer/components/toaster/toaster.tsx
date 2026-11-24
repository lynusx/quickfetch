import { Toaster as Sonner } from 'sonner'

interface ToasterProps {
  theme: 'light' | 'dark'
}

export const Toaster = ({ theme }: ToasterProps) => {
  return <Sonner position="bottom-right" theme={theme} richColors closeButton />
}
