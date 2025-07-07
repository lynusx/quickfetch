import { createRoot } from 'react-dom/client'
import { Theme } from '@radix-ui/themes'
import { BrowserRouter } from 'react-router'
import '@radix-ui/themes/styles.css'

import App from './App.tsx'
import './index.css'

const root = document.getElementById('root') as HTMLElement
if (root) {
  createRoot(root).render(
    <Theme
      appearance="light"
      accentColor="blue"
      radius="large"
      panelBackground="solid"
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </Theme>,
  )
}
