import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'

import App from './App.tsx'
import './index.css'

// Electron 生产环境通过 file:// 加载页面，必须使用 HashRouter
const root = document.getElementById('root') as HTMLElement
if (root) {
  createRoot(root).render(
    <HashRouter>
      <App />
    </HashRouter>,
  )
}
