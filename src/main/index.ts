import { BrowserWindow, app, shell } from 'electron'
import { join } from 'node:path'

import { registerIpcHandlers } from './ipc'

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
