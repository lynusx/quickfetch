import { BrowserWindow, nativeTheme } from 'electron'
import type { TitleBarOverlayOptions } from 'electron'

import { DEFAULT_PREFERENCES } from '../../shared/ipc'
import type { ThemeAppearance, UiScale } from '../../shared/ipc'

/**
 * 自定义标题栏高度，必须与渲染层 `.app-topbar` 的 40px 保持一致。
 *
 * 内容整体下移这一高度，窗口顶部只保留系统窗口控件：
 * macOS 是红绿灯，Windows 是右上角的最小化/最大化/关闭。
 */
export const WINDOW_CHROME_HEIGHT = 40

/** 画布底色（对应 Radix slate --gray-2），避免窗口首屏或切主题时闪白/闪黑 */
const WINDOW_BG_LIGHT = '#f9f9fb'
const WINDOW_BG_DARK = '#18191b'

/** Windows 标题栏按钮符号色（对应 Radix slate --gray-12） */
const OVERLAY_SYMBOL_LIGHT = '#1c2024'
const OVERLAY_SYMBOL_DARK = '#edeef0'

let listenerInstalled = false
let currentScale: UiScale = DEFAULT_PREFERENCES.scale

export const resolveWindowBackground = (dark: boolean): string =>
  dark ? WINDOW_BG_DARK : WINDOW_BG_LIGHT

export const resolveTitleBarOverlay = (
  dark: boolean,
): TitleBarOverlayOptions => ({
  color: '#00000000',
  symbolColor: dark ? OVERLAY_SYMBOL_DARK : OVERLAY_SYMBOL_LIGHT,
  height: WINDOW_CHROME_HEIGHT,
})

/** 将当前系统/应用明暗状态同步到指定窗口的底色与 Windows 顶栏控件色 */
export const syncWindowAppearance = (window: BrowserWindow): void => {
  if (window.isDestroyed()) return

  const dark = nativeTheme.shouldUseDarkColors
  window.setBackgroundColor(resolveWindowBackground(dark))

  if (process.platform !== 'darwin') {
    try {
      window.setTitleBarOverlay(resolveTitleBarOverlay(dark))
    } catch {
      // 非无边框或不支持 titleBarOverlay 的窗口忽略即可
    }
  }
}

const syncAllWindows = (): void => {
  for (const window of BrowserWindow.getAllWindows()) {
    syncWindowAppearance(window)
  }
}

/** 将当前缩放比例同步到指定窗口（冷启动与首次加载兜底） */
export const syncWindowScale = (window: BrowserWindow): void => {
  if (window.isDestroyed()) return
  window.webContents.setZoomFactor(currentScale / 100)
}

/**
 * 更新主进程缓存的缩放比例。
 *
 * 运行期缩放由渲染层通过 webFrame.setZoomFactor 连续弹簧插值驱动，
 * 这里只更新缓存供新窗口或页面重载时使用，避免落盘返回时打断动画。
 */
export const rememberUiScale = (scale: UiScale): void => {
  currentScale = scale
}

/** 切换 Electron 原生主题源，并刷新全部已打开窗口的底色与顶栏按钮色 */
export const applyThemeAppearance = (appearance: ThemeAppearance): void => {
  nativeTheme.themeSource = appearance
  syncAllWindows()
}

/** 启动期初始化主题源与缩放比例，并监听系统深浅色变化（选择「跟随系统」时生效） */
export const initAppearanceService = (
  appearance: ThemeAppearance,
  scale: UiScale,
): void => {
  currentScale = scale
  nativeTheme.themeSource = appearance

  if (!listenerInstalled) {
    listenerInstalled = true
    nativeTheme.on('updated', syncAllWindows)
  }
}
