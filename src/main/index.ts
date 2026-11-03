import { BrowserWindow, app, screen, shell } from 'electron'
import { join } from 'node:path'

import { registerIpcHandlers } from './ipc'
import { cleanupSettingsTempFiles } from './services/settings'
import { persistUnfinished } from './services/scanner'

// electron-vite 在开发模式下注入渲染层 dev server 地址
const rendererDevUrl = process.env['ELECTRON_RENDERER_URL']

const DEFAULT_WINDOW_WIDTH = 1280
const DEFAULT_WINDOW_HEIGHT = 800
const MIN_WINDOW_WIDTH = 1080
const MIN_WINDOW_HEIGHT = 600
/** 窗口与工作区边缘的留白，避免贴边或压住任务栏 */
const WINDOW_EDGE_MARGIN = 64

/**
 * 按主屏工作区计算初始尺寸。
 *
 * workAreaSize 已排除任务栏，单位是 DIP，和 BrowserWindow 的宽高一致；
 * 因此在 125%/150% 缩放下也按逻辑像素判断，不会把窗口算出屏幕。
 */
const resolveWindowSize = (): { width: number; height: number } => {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  return {
    width: Math.max(
      MIN_WINDOW_WIDTH,
      Math.min(DEFAULT_WINDOW_WIDTH, width - WINDOW_EDGE_MARGIN),
    ),
    height: Math.max(
      MIN_WINDOW_HEIGHT,
      Math.min(DEFAULT_WINDOW_HEIGHT, height - WINDOW_EDGE_MARGIN),
    ),
  }
}

const createWindow = (): BrowserWindow => {
  const { width, height } = resolveWindowSize()

  const window = new BrowserWindow({
    width,
    height,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    center: true,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    title: 'SHX Tools',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // 等首屏渲染完成再显示，避免白屏闪烁
  window.once('ready-to-show', () => window.show())

  // 外部链接交给系统浏览器，不在应用内开新窗口
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (rendererDevUrl) {
    void window.loadURL(rendererDevUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}

// 固定中文语言环境：日期控件与原生对话框按 zh-CN 显示
// 必须在 app ready 之前设置
app.commandLine.appendSwitch('lang', 'zh-CN')

// 单实例锁：双开时两个进程会共写同一份 settings.json / history，
// 后写覆盖先写，历史裁剪也会互相删记录。
const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  // 直接退出，绕过 before-quit，避免第二个实例触发 persistUnfinished
  app.exit(0)
} else {
  app.on('second-instance', () => {
    const window = BrowserWindow.getAllWindows()[0]

    if (!window) return

    if (window.isMinimized()) window.restore()

    window.show()
    window.focus()
  })

  app.whenReady().then(async () => {
    // Windows 任务栏分组与通知标识
    app.setAppUserModelId('com.lynusx.shx-tools')

    // 上次进程被强杀时可能留下 settings.json.*.tmp，先清掉再开放读写
    await cleanupSettingsTempFiles()

    registerIpcHandlers()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  /** 退出流程只跑一次，第二次 app.quit() 直接放行 */
  let savedOnQuit = false

  /**
   * 退出前把还没跑完的扫描任务落盘。
   *
   * 一次扫描动辄几分钟，用户中途关窗口很常见；不拦一下的话，已经读到的
   * 几千张图会随着进程消失，重启后历史里干干净净，像是从没扫过。
   * 这里把当前进度按 interrupted 存进历史，重启后能看到「扫到哪儿了」，
   * 参数也在，点一下就能按原参数重扫。
   *
   * 写盘是异步的，必须先拦下这次退出；但也不能无限等 —— 磁盘卡住或记录
   * 特别大时最多等 3 秒，剩下的交给操作系统收尾。
   */
  app.on('before-quit', (event) => {
    if (savedOnQuit) return

    savedOnQuit = true
    event.preventDefault()

    // 先藏窗口再写盘：让用户看到的是「关掉了」，而不是一个点不动的窗口
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.hide()
    }

    const timeout = new Promise<void>((resolve) => {
      setTimeout(resolve, 3000)
    })

    void Promise.race([persistUnfinished(), timeout])
      .catch((error: unknown) => {
        console.error('退出前保存扫描历史失败:', error)
      })
      .finally(() => app.quit())
  })
}
