import type { MarketSymbol, OHLCV, SupportedTimeframe } from '../types/market'

interface HistoryResponse {
  ok?: boolean
  candles?: OHLCV[]
  error?: string
}

const writeTimestamps = new Map<string, number>()
const HISTORY_CACHE_PATH = '/api/history-cache'
let cacheDisabledReason = ''

function cacheKey(symbolId: string, timeframe: SupportedTimeframe) {
  return `${symbolId}:${timeframe}`
}

function isEnabled() {
  return !cacheDisabledReason
}

function disableHistoryCache(reason: string) {
  if (!cacheDisabledReason) {
    cacheDisabledReason = reason
    console.warn(reason)
  }
}

async function readJsonResponse<T>(response: Response, operation: 'read' | 'write') {
  const contentType = response.headers.get('content-type') || ''

  if (response.status === 404 || response.status === 503) {
    disableHistoryCache('Đã tắt bộ nhớ đệm lịch sử: API cache Turso không khả dụng hoặc chưa được cấu hình.')
    throw new Error(`Bộ nhớ đệm lịch sử (${operation}) không khả dụng (${response.status})`)
  }

  if (!response.ok) {
    throw new Error(`Bộ nhớ đệm lịch sử (${operation}) thất bại (${response.status})`)
  }

  if (!contentType.includes('application/json')) {
    disableHistoryCache('Đã tắt bộ nhớ đệm lịch sử: API trả về nội dung không phải JSON.')
    throw new Error(`Bộ nhớ đệm lịch sử (${operation}) trả về nội dung không hợp lệ`)
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

export async function readHistoryCache(symbol: MarketSymbol, timeframe: SupportedTimeframe, limit = 500) {
  if (!isEnabled()) {
    return []
  }

  const url = new URL(HISTORY_CACHE_PATH, window.location.origin)
  url.searchParams.set('symbol', symbol.id)
  url.searchParams.set('timeframe', timeframe)
  url.searchParams.set('limit', String(limit))

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })

  const payload = await readJsonResponse<HistoryResponse>(response, 'read')
  if (payload.ok === false) {
    throw new Error(payload.error || 'Đọc bộ nhớ đệm lịch sử thất bại')
  }

  return normalizeCandles(payload.candles).slice(-limit)
}

export async function writeHistoryCache(
  symbol: MarketSymbol,
  timeframe: SupportedTimeframe,
  candles: OHLCV[],
  options: { source?: string } = {},
) {
  if (!isEnabled() || !candles.length) {
    return
  }

  const key = cacheKey(symbol.id, timeframe)
  const lastWrite = writeTimestamps.get(key) ?? 0
  if (Date.now() - lastWrite < 20_000) {
    return
  }

  writeTimestamps.set(key, Date.now())

  const response = await fetch(HISTORY_CACHE_PATH, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      symbol: symbol.id,
      timeframe,
      candles: candles.slice(-500),
      assetCategory: symbol.category,
      source: options.source,
    }),
  })

  const payload = await readJsonResponse<{ ok?: boolean; error?: string }>(response, 'write')
  if (payload.ok === false) {
    throw new Error(payload.error || 'Ghi bộ nhớ đệm lịch sử thất bại')
  }
}
