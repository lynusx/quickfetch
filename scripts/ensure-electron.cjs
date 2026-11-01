#!/usr/bin/env node
// 兜底脚本：pnpm 在某些策略下会跳过 electron 的 postinstall，
// 导致 node_modules/electron/dist 不存在（启动时报 "Electron uninstall"）。
// 这里在 dev/start 前快速校验，缺失时调用 electron 自带的安装脚本。
const { existsSync, readFileSync } = require('node:fs')
const { execFileSync } = require('node:child_process')
const { dirname, join } = require('node:path')

const electronDir = dirname(require.resolve('electron/package.json'))
const pathFile = join(electronDir, 'path.txt')

// GitHub Release 直连在国内网络下经常超时，默认走 npmmirror 镜像；
// 已显式设置 ELECTRON_MIRROR 时以用户配置为准（可覆盖为官方源或其他镜像）。
const DEFAULT_MIRROR = 'https://npmmirror.com/mirrors/electron/'

if (!existsSync(pathFile)) {
  console.log('[ensure-electron] 未检测到 Electron 二进制，开始安装...')

  const mirror = process.env['ELECTRON_MIRROR'] || DEFAULT_MIRROR
  console.log(`[ensure-electron] 下载源: ${mirror}`)

  execFileSync(process.execPath, [join(electronDir, 'install.js')], {
    cwd: electronDir,
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_MIRROR: mirror },
  })
}

// 二进制在，不代表跑得起来：项目目录若被标成 Low 完整性级别，Chromium
// 沙箱初始化会在主进程脚本执行前直接崩掉，pnpm dev 只剩一个退出码
// 0x80000003（终端里显示 2147483651），没有任何日志可查。
// 这里真跑一次 --version，失败时把排查方向直接打出来。
if (process.env['SHX_SKIP_ELECTRON_CHECK'] === '1') {
  process.exit(0)
}

const electronExe = join(
  electronDir,
  'dist',
  readFileSync(pathFile, 'utf8').trim(),
)

// ELECTRON_RUN_AS_NODE 会让 --version 变成 Node 的版本，掩盖真实问题
const checkEnv = { ...process.env }
delete checkEnv['ELECTRON_RUN_AS_NODE']

try {
  const version = execFileSync(electronExe, ['--version'], {
    encoding: 'utf8',
    timeout: 15000,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: checkEnv,
  }).trim()

  console.log(`[ensure-electron] Electron ${version} 可正常启动`)
} catch (error) {
  console.error(
    '[ensure-electron] Electron 无法启动，pnpm dev 会在打开窗口前崩溃。',
  )

  if (Number.isInteger(error.status)) {
    console.error(`[ensure-electron] 退出码: ${error.status}`)
  } else if (error.code) {
    console.error(`[ensure-electron] 启动失败: ${error.code}`)
  }
  const stderr = String(error.stderr || '').trim()
  if (stderr) {
    console.error(`[ensure-electron] stderr: ${stderr}`)
  }

  if (error.code === 'ENOENT') {
    console.error(
      '二进制缺失或不可执行，可删除 node_modules/electron 后重新 pnpm install。',
    )
    console.error('')
  } else if (process.platform === 'win32') {
    console.error('')
    console.error(
      '最常见的本机原因：项目目录或 Electron 文件被标成 Low 完整性级别。',
    )
    console.error(
      'Chromium 沙箱初始化会直接触发 0x80000003（终端里显示 2147483651）。',
    )
    console.error('在项目根目录执行：')
    console.error('  icacls . | findstr Mandatory')
    console.error('  icacls . /setintegritylevel "(OI)(CI)Medium" /T /C')
    console.error('')
  } else if (process.platform === 'darwin') {
    const electronApp = join(electronDir, 'dist', 'Electron.app')

    console.error('')
    console.error(
      'macOS 上常见原因：二进制架构不匹配、Gatekeeper 隔离属性或签名失效。',
    )
    console.error('依次检查：')
    console.error(`  file "${join(electronApp, 'Contents/MacOS/Electron')}"`)
    console.error(`  xattr -p com.apple.quarantine "${electronApp}"`)
    console.error(`  codesign --verify --deep --strict "${electronApp}"`)
    console.error('清除隔离属性，或在开发环境 ad-hoc 重签：')
    console.error(`  xattr -dr com.apple.quarantine "${electronApp}"`)
    console.error(`  codesign --force --deep --sign - "${electronApp}"`)
    console.error('')
  }

  console.error('确认环境无误后，可设 SHX_SKIP_ELECTRON_CHECK=1 跳过此检查。')
  process.exit(1)
}
