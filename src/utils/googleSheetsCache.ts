import type { MarketSymbol, OHLCV, SupportedTimeframe } from '../types/market'
import { APP_ENV } from './env'

interface HistoryResponse {
  ok?: boolean
  candles?: OHLCV[]
  error?: string
}

const writeTimestamps = new Map<string, number>()
const GOOGLE_SHEETS_PROXY_PATH = '/api/sheets-cache'
let sheetCacheDisabledReason = ''

function cacheKey(symbolId: string, timeframe: SupportedTimeframe) {
  return `${symbolId}:${timeframe}`
}

function isEnabled() {
  return !sheetCacheDisabledReason && APP_ENV.googleSheetsEnabled && Boolean(APP_ENV.googleSheetsWebAppUrl)
}

function getSheetsRequestUrl() {
  if (typeof window !== 'undefined' && ['127.0.0.1', 'localhost'].includes(window.location.hostname)) {
    return GOOGLE_SHEETS_PROXY_PATH
  }

  return APP_ENV.googleSheetsWebAppUrl
}

function disableSheetCache(reason: string) {
  if (!sheetCacheDisabledReason) {
    sheetCacheDisabledReason = reason
    console.warn(reason)
  }
}

async function readJsonResponse<T>(response: Response, operation: 'read' | 'write') {
  const contentType = response.headers.get('content-type') || ''

  if (
    response.status === 401 ||
    response.status === 403 ||
    response.url.includes('accounts.google.com') ||
    (!response.ok && contentType.includes('text/html'))
  ) {
    disableSheetCache(
      'Google Sheets cache disabled: Apps Script Web App is not publicly accessible. Redeploy as Web app with access set to Anyone.',
    )
    throw new Error(`Google Sheets cache ${operation} unauthorized`)
  }

  if (!response.ok) {
    throw new Error(`Google Sheets cache ${operation} failed (${response.status})`)
  }

  if (!contentType.includes('application/json')) {
    disableSheetCache(
      'Google Sheets cache disabled: Apps Script Web App returned non-JSON content. Check the Web App URL and deployment access.',
    )
    throw new Error(`Google Sheets cache ${operation} returned invalid content`)
  }

  return (await response.json()) as T
}

function normalizeCandles(input: unknown) {
  if (!Array.isArray(input)) {
    return []
  }

  return input
    .map((row) => {
      const item = row as Record<string, unknown>
      const time = Number(item.time)
      const open = Number(item.open)
      const high = Number(item.high)
      const low = Number(item.low)
      const close = Number(item.close)
      const volume = Number(item.volume)
      return Number.isFinite(time) &&
        Number.isFinite(open) &&
        Number.isFinite(high) &&
        Number.isFinite(low) &&
        Number.isFinite(close) &&
        Number.isFinite(volume)
        ? { time, open, high, low, close, volume }
        : null
    })
    .filter((item): item is OHLCV => item != null)
    .sort((a, b) => a.time - b.time)
}

export async function readSheetHistory(symbol: MarketSymbol, timeframe: SupportedTimeframe, limit = 500) {
  if (!isEnabled()) {
    return []
  }

  const url = new URL(getSheetsRequestUrl(), typeof window !== 'undefined' ? window.location.origin : undefined)
  url.searchParams.set('action', 'history')
  url.searchParams.set('symbol', symbol.id)
  url.searchParams.set('timeframe', timeframe)
  url.searchParams.set('limit', String(limit))
  if (APP_ENV.googleSheetsSecret) {
    url.searchParams.set('secret', APP_ENV.googleSheetsSecret)
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })

  const payload = await readJsonResponse<HistoryResponse>(response, 'read')
  if (payload.ok === false) {
    throw new Error(payload.error || 'Google Sheets cache read failed')
  }

  return normalizeCandles(payload.candles).slice(-limit)
}

export async function writeSheetHistory(symbol: MarketSymbol, timeframe: SupportedTimeframe, candles: OHLCV[]) {
  if (!isEnabled() || !candles.length) {
    return
  }

  const key = cacheKey(symbol.id, timeframe)
  const lastWrite = writeTimestamps.get(key) ?? 0
  if (Date.now() - lastWrite < 20_000) {
    return
  }

  writeTimestamps.set(key, Date.now())

  const response = await fetch(getSheetsRequestUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      action: 'upsertHistory',
      secret: APP_ENV.googleSheetsSecret || undefined,
      symbol: symbol.id,
      timeframe,
      candles: candles.slice(-500),
    }),
  })

  const payload = await readJsonResponse<{ ok?: boolean; error?: string }>(response, 'write')
  if (payload.ok === false) {
    throw new Error(payload.error || 'Google Sheets cache write failed')
  }
}
