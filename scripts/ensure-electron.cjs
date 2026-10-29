#!/usr/bin/env node
// 兜底脚本：pnpm 在某些策略下会跳过 electron 的 postinstall，
// 导致 node_modules/electron/dist 不存在（启动时报 "Electron uninstall"）。
// 这里在 dev/start 前快速校验，缺失时调用 electron 自带的安装脚本。
const { existsSync } = require('node:fs')
const { execFileSync } = require('node:child_process')
const { dirname, join } = require('node:path')

const electronDir = dirname(require.resolve('electron/package.json'))
const pathFile = join(electronDir, 'path.txt')

if (existsSync(pathFile)) {
  process.exit(0)
}

console.log('[ensure-electron] 未检测到 Electron 二进制，开始安装...')

execFileSync(process.execPath, [join(electronDir, 'install.js')], {
  cwd: electronDir,
  stdio: 'inherit',
})
