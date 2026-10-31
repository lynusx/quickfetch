import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { Loader2 } from 'lucide-react'

import LayoutPage from './pages/LayoutPage'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'

const ROUTES = {
  IMAGE_COPY: '/image-copy',
  LXT_SCAN: '/lxt',
  EXCEL_PARSE: '/excel-parse',
  SETTINGS: '/settings',
  DEFAULT: '/image-copy',
} as const

// 懒加载页面
const ImageCopyPage = lazy(() => import('./pages/ImageCopyPage'))
const LxtScanPage = lazy(() => import('./pages/LxtScanPage'))
const ExcelParsePage = lazy(() => import('./pages/ExcelParsePage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))

// 404 重定向组件
const NotFoundRedirect = ({ defaultPath }: { defaultPath: string }) => (
  <Navigate to={defaultPath} replace state={{ from: location.pathname }} />
)

const PageLoader = () => (
  <div className="flex min-h-80 items-center justify-center">
    <Loader2 className="size-5 animate-spin text-muted-foreground" />
  </div>
)

function App() {
  return (
    <TooltipProvider delayDuration={300}>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<LayoutPage />}>
            <Route
              index
              element={<Navigate to={ROUTES.IMAGE_COPY} replace />}
            />

            <Route path={ROUTES.IMAGE_COPY} element={<ImageCopyPage />} />
            <Route path={ROUTES.LXT_SCAN} element={<LxtScanPage />} />
            <Route path={ROUTES.EXCEL_PARSE} element={<ExcelParsePage />} />
            <Route path={ROUTES.SETTINGS} element={<SettingsPage />} />

            <Route
              path="*"
              element={<NotFoundRedirect defaultPath={ROUTES.DEFAULT} />}
            />
          </Route>
        </Routes>
      </Suspense>
      <Toaster position="bottom-right" richColors closeButton />
    </TooltipProvider>
  )
}

export default App
