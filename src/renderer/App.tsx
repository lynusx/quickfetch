import { Theme } from '@radix-ui/themes'

import { Toaster } from '@/components/Toaster'
import { AppRoutes } from './routes/AppRoutes'

function App() {
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
