import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const googleSheetsUrl = env.VITE_GOOGLE_SHEETS_WEB_APP_URL?.trim()
  let googleSheetsProxy: Record<string, unknown> = {}

  if (googleSheetsUrl) {
    const targetUrl = new URL(googleSheetsUrl)
    const basePath = targetUrl.pathname

    googleSheetsProxy = {
      '/api/sheets-cache': {
        target: targetUrl.origin,
        changeOrigin: true,
        followRedirects: true,
        rewrite: (path: string) => `${basePath}${path.replace(/^\/api\/sheets-cache/, '')}`,
      },
    }
  }

  const proxy = {
    '/api/yahoo': {
      target: 'https://query1.finance.yahoo.com',
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/api\/yahoo/, ''),
    },
    '/api/binance': {
      target: 'https://api.binance.com',
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/api\/binance/, ''),
    },
    '/api/alpha': {
      target: 'https://www.alphavantage.co',
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/api\/alpha/, ''),
    },
    '/api/openai': {
      target: 'https://api.openai.com',
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/api\/openai/, ''),
    },
    ...googleSheetsProxy,
  }

  return {
    plugins: [vue()],
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy,
    },
    preview: {
      host: '127.0.0.1',
      port: 4173,
      strictPort: true,
    },
  }
})
