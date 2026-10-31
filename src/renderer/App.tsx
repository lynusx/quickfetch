import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { Theme, Flex, Spinner } from '@radix-ui/themes'

import LayoutPage from './layouts/AppLayout'
import { Toaster } from '@/components/Toaster'

const ROUTES = {
  IMAGE_COPY: '/image-copy',
  LXT_SCAN: '/lxt',
  PL_SCAN: '/pl',
  EXCEL_PARSE: '/excel-parse',
  SETTINGS: '/settings',
  DEFAULT: '/image-copy',
} as const

// 懒加载页面
const ImageCopyPage = lazy(() => import('./features/scan/pages/ImageCopyPage'))
const LxtScanPage = lazy(() => import('./features/scan/pages/LxtScanPage'))
const PlScanPage = lazy(() => import('./features/scan/pages/PlScanPage'))
const ExcelParsePage = lazy(() => import('./features/excel/ExcelParsePage'))
const SettingsPage = lazy(() => import('./features/settings/SettingsPage'))

// 404 重定向组件
const NotFoundRedirect = ({ defaultPath }: { defaultPath: string }) => (
  <Navigate to={defaultPath} replace state={{ from: location.pathname }} />
)

const PageLoader = () => (
  <Flex minHeight="320px" align="center" justify="center">
    <Spinner size="3" />
  </Flex>
)

function App() {
  return (
    <Theme
      appearance="light"
      accentColor="indigo"
      grayColor="slate"
      radius="medium"
      scaling="100%"
    >
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<LayoutPage />}>
            <Route
              index
              element={<Navigate to={ROUTES.IMAGE_COPY} replace />}
            />

            <Route path={ROUTES.IMAGE_COPY} element={<ImageCopyPage />} />
            <Route path={ROUTES.LXT_SCAN} element={<LxtScanPage />} />
            <Route path={ROUTES.PL_SCAN} element={<PlScanPage />} />
            <Route path={ROUTES.EXCEL_PARSE} element={<ExcelParsePage />} />
            <Route path={ROUTES.SETTINGS} element={<SettingsPage />} />

            <Route
              path="*"
              element={<NotFoundRedirect defaultPath={ROUTES.DEFAULT} />}
            />
          </Route>
        </Routes>
      </Suspense>
      <Toaster />
    </Theme>
  )
}

export default App
