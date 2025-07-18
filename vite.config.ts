import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// 图片扩展名列表
const imgExts = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp']

// 读取 package.json 获取版本信息
const packageJson = JSON.parse(
  readFileSync(resolve(__dirname, 'package.json'), 'utf-8'),
)

// https://vite.dev/config/
export default defineConfig({
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(packageJson.version),
  },
  plugins: [
    react(),
    // 移除 VitePWA 相关配置
  ],
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'js/[name]-[hash].js',
        chunkFileNames: 'js/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          const name = assetInfo.names[0] || ''
          if (name.endsWith('.css')) {
            return 'css/[name]-[hash][extname]'
          }
          if (imgExts.some((ext) => name.endsWith(ext))) {
            return 'img/[name]-[hash][extname]'
          }

          return 'assets/[name]-[hash][extname]'
        },
      },
    },
  },
})
