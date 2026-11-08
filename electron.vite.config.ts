import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const rootDir = process.cwd()

// 渲染层构建产物的图片扩展名：只决定资源放 img/ 还是 assets/。
// 它与扫描/复制能不能识别图片无关 —— 运行时支持的格式见
// src/shared/imageExtensions.ts，新增扫描格式不要改这里。
const bundledImageExts = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.ico',
  '.webp',
]

// 读取 package.json 获取版本信息
const packageJson = JSON.parse(
  readFileSync(resolve(rootDir, 'package.json'), 'utf-8'),
) as { version: string }

// 主进程与 preload 固定输出 CommonJS：
// 仓库使用 type: module，但 Electron 的 preload 走 CJS 最稳，且主进程可直接用 __dirname。
const nodeOutput = {
  format: 'cjs' as const,
  entryFileNames: '[name].cjs',
  chunkFileNames: '[name]-[hash].cjs',
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(rootDir, 'src/main/index.ts'),
        output: nodeOutput,
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(rootDir, 'src/preload/index.ts'),
        output: nodeOutput,
      },
    },
  },
  renderer: {
    root: resolve(rootDir, 'src/renderer'),
    base: './',
    publicDir: resolve(rootDir, 'src/renderer/public'),
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(packageJson.version),
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve(rootDir, 'src/renderer'),
        '@shared': resolve(rootDir, 'src/shared'),
      },
    },
    server: {
      port: 5173,
    },
    build: {
      outDir: resolve(rootDir, 'out/renderer'),
      emptyOutDir: true,
      rollupOptions: {
        input: resolve(rootDir, 'src/renderer/index.html'),
        output: {
          entryFileNames: 'js/[name]-[hash].js',
          chunkFileNames: 'js/[name]-[hash].js',
          assetFileNames: (assetInfo) => {
            const name = assetInfo.names?.[0] ?? ''

            if (name.endsWith('.css')) {
              return 'css/[name]-[hash][extname]'
            }
            if (bundledImageExts.some((ext) => name.endsWith(ext))) {
              return 'img/[name]-[hash][extname]'
            }

            return 'assets/[name]-[hash][extname]'
          },
        },
      },
    },
  },
})
