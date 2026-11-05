import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { execSync } from 'child_process'

// Метка сборки для футера портала: по ней видно, какая версия выкачена.
function gitShortSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return ''
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __BUILD_SHA__: JSON.stringify(process.env.BUILD_SHA || gitShortSha()),
  },
  // Портал обслуживается по пути /portal/ на FastAPI сервере
  base: '/portal/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    // Карты исходников не публикуем: прод отдавал бы весь исходный код портала.
    // Сервиса разбора ошибок (Sentry и т.п.), которому они нужны, нет.
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          ui: ['lucide-react'],
          state: ['zustand', '@tanstack/react-query'],
        },
      },
    },
  },
})
