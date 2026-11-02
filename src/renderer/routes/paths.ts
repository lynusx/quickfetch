/**
 * 应用路由路径的唯一来源。
 *
 * 侧边栏、页面内跳转与路由注册都从这里取，避免同一路径在三处各写一份。
 */
export const ROUTES = {
  EL: '/el',
  LXT_EL: '/lixite',
  LP_PL: '/lipo',
  EXCEL_PARSE: '/xlsx',
  SETTINGS: '/settings',
} as const

/** 根路径与未知路径都回到 EL 扫描页 */
export const DEFAULT_ROUTE = ROUTES.EL
