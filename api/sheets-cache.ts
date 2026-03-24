import { readSheetHistory, writeSheetHistory } from './_lib/google-sheets'

function sendJson(res: any, status: number, payload: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

export default async function handler(req: any, res: any) {
  if (req.method === 'GET') {
    const symbol = String(req.query.symbol || '')
    const timeframe = String(req.query.timeframe || '')
    const limit = Number(req.query.limit || 500)

    if (!symbol || !timeframe) {
      return sendJson(res, 400, { ok: false, error: 'Missing symbol or timeframe' })
    }

    try {
      const payload = await readSheetHistory(symbol, timeframe, limit)
      return sendJson(res, 200, payload)
    } catch (error) {
      return sendJson(res, 502, { ok: false, error: error instanceof Error ? error.message : 'Sheets cache read failed' })
    }
  }

  if (req.method === 'POST') {
    const payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
    const symbol = String(payload.symbol || '')
    const timeframe = String(payload.timeframe || '')
    const candles = Array.isArray(payload.candles) ? payload.candles : []

    if (!symbol || !timeframe) {
      return sendJson(res, 400, { ok: false, error: 'Missing symbol or timeframe' })
    }

    try {
      const result = await writeSheetHistory(symbol, timeframe, candles)
      return sendJson(res, 200, result)
    } catch (error) {
      return sendJson(res, 502, { ok: false, error: error instanceof Error ? error.message : 'Sheets cache write failed' })
    }
  }

  res.setHeader('Allow', 'GET, POST')
  return sendJson(res, 405, { ok: false, error: 'Method not allowed' })
}
