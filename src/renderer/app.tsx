import { Theme } from '@radix-ui/themes'

import { Toaster } from '@/components/toaster/toaster'
import { AppRoutes } from './routes/app-routes'

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
