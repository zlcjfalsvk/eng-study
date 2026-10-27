import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.1.0') },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      workbox: {
        // 앱 셸만 프리캐시. 콘텐츠(data/*.json)는 받은 것만 캐시하고 다음 방문 때 뒤에서 갱신한다.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['data/**'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /\/data\/.+\.json$/.test(url.pathname),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'eng-data', expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 90 } },
          },
        ],
      },
      manifest: {
        name: 'Eng — 상황별 영단어·숙어·문법',
        short_name: 'Eng',
        description: '상황별 뜻과 예문(음성)으로 배우는 영단어·구동사·영문법 학습 앱',
        lang: 'ko',
        theme_color: '#4f46e5',
        background_color: '#f8fafc',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  build: {
    chunkSizeWarningLimit: 2000,
  },
})
