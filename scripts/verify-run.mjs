/**
 * 逻辑级回归测试的入口：打包 + 运行。
 *
 * 为什么不直接 `tsx scripts/verify-fixes.ts`：
 * 被测模块里有 `import { app } from 'electron'` 之类的语句，纯 Node 跑不起来。
 * 这里用 esbuild 打成一个 ESM 文件，并把 electron 指到一个空壳上，
 * 就能在 Linux/CI 上不启动 Electron 验证现场问题的根因。
 */
import { spawnSync } from 'node:child_process'
import {
  closeSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readSync,
  writeFileSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const work = mkdtempSync(join(tmpdir(), 'quickfetch-verify-'))

/**
 * esbuild 是 vite 的传递依赖，pnpm 不会把它提升到 node_modules 根，
 * require.resolve 也找不到；只能去 .pnpm 的虚拟存储里按版本目录找。
 */
const esbuildBin = (() => {
  const store = join(root, 'node_modules/.pnpm')
  const dir = readdirSync(store).find((name) => name.startsWith('esbuild@'))
  if (!dir)
    throw new Error(`找不到 esbuild，请先执行 pnpm install（在 ${store} 里）`)
  return join(store, dir, 'node_modules/esbuild/bin/esbuild')
})()

const stub = join(work, 'electron-stub.mjs')
writeFileSync(
  stub,
  [
    'export const app = { getPath: () => process.cwd(), getName: () => "QuickFetch", getVersion: () => "0.0.0", whenReady: async () => undefined, on: () => undefined, quit: () => undefined }',
    'export const ipcMain = { handle: () => undefined, on: () => undefined, removeHandler: () => undefined }',
    'export const shell = { openPath: async () => "" }',
    'export const dialog = { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) }',
    'export default { app, ipcMain, shell, dialog }',
    '',
  ].join('\n'),
)

/**
 * esbuild 0.28 起，非 Windows 平台的 postinstall 会把 bin 换成原生二进制，
 * 只有 Windows 保留带 shebang 的 JS shim。两种形态的启动方式不一样。
 */
function isJsScript(file) {
  const fd = openSync(file, 'r')
  try {
    const head = Buffer.alloc(2)
    readSync(fd, head, 0, 2, 0)
    return head.toString() === '#!'
  } finally {
    closeSync(fd)
  }
}

const out = join(work, 'verify.mjs')
const buildArgs = [
  'scripts/verify-fixes.ts',
  '--bundle',
  '--platform=node',
  '--format=esm',
  `--outfile=${out}`,
  `--alias:electron=${stub}`,
  '--external:node:*',
  '--log-level=error',
]
const build = isJsScript(esbuildBin)
  ? spawnSync(process.execPath, [esbuildBin, ...buildArgs], {
      cwd: root,
      stdio: 'inherit',
    })
  : spawnSync(esbuildBin, buildArgs, { cwd: root, stdio: 'inherit' })

if (build.error) {
  console.error('启动 esbuild 失败:', build.error)
}

if (build.status !== 0) {
  rmSync(work, { recursive: true, force: true })
  process.exit(build.status ?? 1)
}

const run = spawnSync(process.execPath, [out], { cwd: root, stdio: 'inherit' })
rmSync(work, { recursive: true, force: true })

process.exit(run.status ?? 1)
