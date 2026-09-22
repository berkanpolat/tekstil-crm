import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5173,
    // Yerel geliştirme: PDF servisi (Cloudflare Worker) CORS'u yalnız crm.tekstilas.com'a açık.
    // Tarayıcıdan localhost'a izin vermek yerine istek Vite üzerinden aynı adresten geçirilir.
    // .env'de VITE_PDF_SERVICE_URL=/pdf-servisi olunca devreye girer; canlı derlemede kullanılmaz.
    proxy: {
      '/pdf-servisi': {
        target: 'https://tekstil-belge-motoru.white-bird-ce69.workers.dev',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/pdf-servisi/, ''),
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      'tests/unit/**/*.{test,spec}.{ts,tsx}',
      'tests/integration/**/*.{test,spec}.{ts,tsx}',
    ],
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
  },
})
