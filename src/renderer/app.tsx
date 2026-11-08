import { Theme } from '@radix-ui/themes'

import { Toaster } from '@/components/toaster/toaster'
import { useUpdateBridge } from '@/features/update/useUpdateBridge'
import { AppRoutes } from './routes/app-routes'

function App() {
  useUpdateBridge()

  return (
    <Theme
      appearance="light"
      accentColor="indigo"
      grayColor="slate"
      radius="medium"
      scaling="100%"
    >
      <AppRoutes />
      <Toaster />
    </Theme>
  )
}

export default App
