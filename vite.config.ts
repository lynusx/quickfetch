import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
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
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'img/favicon.ico',
        'img/favicon.svg',
        'img/apple-touch-icon-180x180.png',
      ],
      manifest: {
        name: 'SHX Tools',
        short_name: 'SHX',
        description: '🐂🐎大礼包、RCA EL图片拷贝工具',
        theme_color: '#ffffff',
        background_color: '#f0f0f0',
        start_url: '/',
        display: 'standalone',
        icons: [
          {
            src: 'img/pwa-64x64.png',
            sizes: '64x64',
            type: 'image/png',
          },
          {
            src: 'img/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'img/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
        ],
      },
    }),
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
