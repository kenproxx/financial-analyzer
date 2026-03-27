import { isHistoryCacheConfigured, readHistoryCache, writeHistoryCache } from './_lib/history-cache.js'

function sendJson(res: any, status: number, payload: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

function parsePositiveLimit(value: unknown, fallback = 500) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return Math.max(1, Math.min(Math.trunc(parsed), 5000))
}

export default async function handler(req: any, res: any) {
  if (!isHistoryCacheConfigured()) {
    return sendJson(res, 503, { ok: false, error: 'Chưa cấu hình bộ nhớ đệm lịch sử. Thiếu biến môi trường Turso.' })
  }

  if (req.method === 'GET') {
    const symbol = String(req.query.symbol || '').trim()
    const timeframe = String(req.query.timeframe || '').trim()
    const limit = parsePositiveLimit(req.query.limit, 500)

    if (!symbol || !timeframe) {
      return sendJson(res, 400, { ok: false, error: 'Thiếu symbol hoặc timeframe' })
    }

    try {
      const candles = await readHistoryCache(symbol, timeframe, limit)
      return sendJson(res, 200, { ok: true, candles })
    } catch (error) {
      return sendJson(res, 502, { ok: false, error: error instanceof Error ? error.message : 'Đọc bộ nhớ đệm lịch sử thất bại' })
    }
  }

  if (req.method === 'POST') {
    let payload: Record<string, unknown>
    try {
      payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
    } catch {
      return sendJson(res, 400, { ok: false, error: 'Nội dung JSON không hợp lệ' })
    }

    const symbol = String(payload.symbol || '').trim()
    const timeframe = String(payload.timeframe || '').trim()
    const candles = Array.isArray(payload.candles) ? payload.candles : []
    const assetCategory = payload.assetCategory ? String(payload.assetCategory).trim() : undefined
    const source = payload.source ? String(payload.source).trim() : undefined

    if (!symbol || !timeframe) {
      return sendJson(res, 400, { ok: false, error: 'Thiếu symbol hoặc timeframe' })
    }

    try {
      const result = await writeHistoryCache(symbol, timeframe, candles, { assetCategory, source })
      return sendJson(res, 200, result)
    } catch (error) {
      return sendJson(res, 502, { ok: false, error: error instanceof Error ? error.message : 'Ghi bộ nhớ đệm lịch sử thất bại' })
    }
  }

  res.setHeader('Allow', 'GET, POST')
  return sendJson(res, 405, { ok: false, error: 'Phương thức không được hỗ trợ' })
}
