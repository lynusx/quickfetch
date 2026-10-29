import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router'

import LayoutPage from './pages/LayoutPage'
import Loading from './components/Loading'

const ROUTES = {
  IMAGE_COPY: '/image-copy',
  EXCEL_PARSE: '/excel-parse',
  DEFAULT: '/image-copy',
} as const

// 懒加载页面
const ImageCopyPage = lazy(() => import('./pages/ImageCopyPage'))
const ExcelParsePage = lazy(() => import('./pages/ExcelParsePage'))

// 404 重定向组件
const NotFoundRedirect = ({ defaultPath }: { defaultPath: string }) => (
  <Navigate to={defaultPath} replace state={{ from: location.pathname }} />
)

function App() {
  return (
    <>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<LayoutPage />}>
            <Route
              index
              element={<Navigate to={ROUTES.IMAGE_COPY} replace />}
            />

            <Route
              path={ROUTES.IMAGE_COPY}
              element={
                <Suspense fallback={<Loading />}>
                  <ImageCopyPage />
                </Suspense>
              }
            />
            <Route
              path={ROUTES.EXCEL_PARSE}
              element={
                <Suspense fallback={<Loading />}>
                  <ExcelParsePage />
                </Suspense>
              }
            />

            <Route
              path="*"
              element={<NotFoundRedirect defaultPath={ROUTES.DEFAULT} />}
            />
          </Route>
        </Routes>
      </Suspense>
    </>
  )
}

export default App
