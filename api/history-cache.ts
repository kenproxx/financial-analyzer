import { isHistoryCacheConfigured, readHistoryCache, writeHistoryCache } from './_lib/history-cache.js'

function sendJson(res: any, status: number, payload: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

export default async function handler(req: any, res: any) {
  if (!isHistoryCacheConfigured()) {
    return sendJson(res, 503, { ok: false, error: 'History cache is not configured. Missing Turso env.' })
  }

  if (req.method === 'GET') {
    const symbol = String(req.query.symbol || '')
    const timeframe = String(req.query.timeframe || '')
    const limit = Number(req.query.limit || 500)

    if (!symbol || !timeframe) {
      return sendJson(res, 400, { ok: false, error: 'Missing symbol or timeframe' })
    }

    try {
      const candles = await readHistoryCache(symbol, timeframe, limit)
      return sendJson(res, 200, { ok: true, candles })
    } catch (error) {
      return sendJson(res, 502, { ok: false, error: error instanceof Error ? error.message : 'History cache read failed' })
    }
  }

  if (req.method === 'POST') {
    const payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
    const symbol = String(payload.symbol || '')
    const timeframe = String(payload.timeframe || '')
    const candles = Array.isArray(payload.candles) ? payload.candles : []
    const assetCategory = payload.assetCategory ? String(payload.assetCategory) : undefined
    const source = payload.source ? String(payload.source) : undefined

    if (!symbol || !timeframe) {
      return sendJson(res, 400, { ok: false, error: 'Missing symbol or timeframe' })
    }

    try {
      const result = await writeHistoryCache(symbol, timeframe, candles, { assetCategory, source })
      return sendJson(res, 200, result)
    } catch (error) {
      return sendJson(res, 502, { ok: false, error: error instanceof Error ? error.message : 'History cache write failed' })
    }
  }

  res.setHeader('Allow', 'GET, POST')
  return sendJson(res, 405, { ok: false, error: 'Method not allowed' })
}
