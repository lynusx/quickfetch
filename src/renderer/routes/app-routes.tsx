import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { Flex, Spinner } from '@radix-ui/themes'

import LayoutPage from '@/layouts/app-layout'
import { DEFAULT_ROUTE, ROUTES } from './paths'

// 页面按路由懒加载，首屏只保留应用外壳
const PlantScanPage = lazy(
  () => import('@/features/scan/components/plant-scan-page'),
)
const ExcelParsePage = lazy(() => import('@/features/excel/excel-parse-page'))
const SettingsPage = lazy(() => import('@/features/settings/settings-page'))

/** 未知路径回到默认扫描页 */
const NotFoundRedirect = () => <Navigate to={DEFAULT_ROUTE} replace />

const PageLoader = () => (
  <Flex minHeight="320px" align="center" justify="center">
    <Spinner size="3" />
  </Flex>
)

export const AppRoutes = () => (
  <Suspense fallback={<PageLoader />}>
    <Routes>
      <Route path="/" element={<LayoutPage />}>
        <Route index element={<Navigate to={DEFAULT_ROUTE} replace />} />

        <Route
          path={ROUTES.EL}
          element={<PlantScanPage key="el" category="el" />}
        />
        <Route
          path={ROUTES.LXT_EL}
          element={<PlantScanPage key="lxt" category="lxt" />}
        />
        <Route
          path={ROUTES.LP_PL}
          element={<PlantScanPage key="pl" category="pl" />}
        />
        <Route
          path={ROUTES.AOI}
          element={<PlantScanPage key="aoi" category="aoi" />}
        />
        <Route path={ROUTES.EXCEL_PARSE} element={<ExcelParsePage />} />
        <Route path={ROUTES.SETTINGS} element={<SettingsPage />} />

        <Route path="*" element={<NotFoundRedirect />} />
      </Route>
    </Routes>
  </Suspense>
)
