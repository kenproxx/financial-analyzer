import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { isHistoryCacheConfigured, readHistoryCache, writeHistoryCache } from './api/_lib/history-cache'

async function readRequestBody(req: NodeJS.ReadableStream) {
  const chunks: Buffer[] = []

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  return Buffer.concat(chunks).toString('utf8')
}

function sendJson(res: any, status: number, payload: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

function historyCacheDevPlugin() {
  return {
    name: 'history-cache-dev',
    configureServer(server: any) {
      server.middlewares.use('/api/history-cache', async (req: any, res: any, next: () => void) => {
        if (!['GET', 'POST'].includes(req.method || '')) {
          next()
          return
        }

        if (!isHistoryCacheConfigured()) {
          sendJson(res, 503, { ok: false, error: 'History cache is not configured. Missing Turso env.' })
          return
        }

        try {
          if (req.method === 'GET') {
            const url = new URL(req.url || '', 'http://127.0.0.1')
            const symbol = String(url.searchParams.get('symbol') || '')
            const timeframe = String(url.searchParams.get('timeframe') || '')
            const limit = Number(url.searchParams.get('limit') || 500)

            if (!symbol || !timeframe) {
              sendJson(res, 400, { ok: false, error: 'Missing symbol or timeframe' })
              return
            }

            const candles = await readHistoryCache(symbol, timeframe, limit)
            sendJson(res, 200, { ok: true, candles })
            return
          }

          const payloadText = await readRequestBody(req)
          const payload = payloadText ? JSON.parse(payloadText) : {}
          const symbol = String(payload.symbol || '')
          const timeframe = String(payload.timeframe || '')
          const candles = Array.isArray(payload.candles) ? payload.candles : []

          if (!symbol || !timeframe) {
            sendJson(res, 400, { ok: false, error: 'Missing symbol or timeframe' })
            return
          }

          const result = await writeHistoryCache(symbol, timeframe, candles, {
            assetCategory: payload.assetCategory ? String(payload.assetCategory) : undefined,
            source: payload.source ? String(payload.source) : undefined,
          })
          sendJson(res, 200, result)
        } catch (error) {
          sendJson(res, 502, { ok: false, error: error instanceof Error ? error.message : 'History cache request failed' })
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [vue(), historyCacheDevPlugin()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
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
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
})
