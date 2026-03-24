import { fetchHistoricalCandles, parseSupportedTimeframes, parseSyncSymbols } from './_lib/market-data'
import { isSheetsCacheConfigured, writeSheetHistory } from './_lib/google-sheets'

function sendJson(res: any, status: number, payload: unknown) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8')
  res.send(JSON.stringify(payload))
}

function isAuthorized(req: any) {
  const expected = process.env.CRON_SECRET?.trim()
  if (!expected) {
    return true
  }

  const authHeader = String(req.headers.authorization || '')
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  const querySecret = String(req.query.secret || '')
  return bearerToken === expected || querySecret === expected
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return sendJson(res, 405, { ok: false, error: 'Method not allowed' })
  }

  if (!isAuthorized(req)) {
    return sendJson(res, 401, { ok: false, error: 'Unauthorized' })
  }

  if (!isSheetsCacheConfigured()) {
    return sendJson(res, 500, { ok: false, error: 'Missing GOOGLE_SHEETS_WEB_APP_URL' })
  }

  const symbols = parseSyncSymbols(process.env.SYNC_SYMBOLS || req.query.symbols)
  const timeframes = parseSupportedTimeframes(process.env.SYNC_TIMEFRAMES || req.query.timeframes)
  const results: Array<Record<string, unknown>> = []

  for (const symbol of symbols) {
    for (const timeframe of timeframes) {
      try {
        const candles = await fetchHistoricalCandles(symbol, timeframe)
        await writeSheetHistory(symbol.id, timeframe, candles)
        results.push({
          symbol: symbol.id,
          timeframe,
          candles: candles.length,
          ok: true,
        })
      } catch (error) {
        results.push({
          symbol: symbol.id,
          timeframe,
          ok: false,
          error: error instanceof Error ? error.message : 'Sync failed',
        })
      }
    }
  }

  const successCount = results.filter((item) => item.ok).length
  return sendJson(res, 200, {
    ok: true,
    synced: successCount,
    failed: results.length - successCount,
    results,
  })
}
