import { createRoot } from 'react-dom/client'
import '@radix-ui/themes/styles.css'
import './index.css'
import App from './App.tsx'

const root = document.getElementById('root') as HTMLElement
if (root) {
  createRoot(root).render(<App />)
}
