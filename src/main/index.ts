import { BrowserWindow, app, shell } from 'electron'
import { join } from 'node:path'

import { registerIpcHandlers } from './ipc'
import { persistUnfinished } from './services/scanner'

// electron-vite 在开发模式下注入渲染层 dev server 地址
const rendererDevUrl = process.env['ELECTRON_RENDERER_URL']

const createWindow = (): BrowserWindow => {
  const window = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1080,
    minHeight: 720,
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

app.whenReady().then(() => {
  // Windows 任务栏分组与通知标识
  app.setAppUserModelId('com.lynusx.shx-tools')

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
