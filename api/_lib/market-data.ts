import { DEFAULT_SYNC_TIMEFRAMES, DEFAULT_SYNC_SYMBOLS, marketById, TIMEFRAME_CONFIG, type MarketSymbol, type SupportedTimeframe } from './market-config.js'

export interface ServerOHLCV {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

function safeNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function sortCandles(candles: ServerOHLCV[]) {
  return [...candles].sort((a, b) => a.time - b.time)
}

function clampCandles(candles: ServerOHLCV[], limit = 500) {
  return candles.slice(-limit)
}

function alphaKey() {
  return process.env.ALPHA_VANTAGE_KEY?.trim() || process.env.VITE_ALPHA_VANTAGE_KEY?.trim() || ''
}

function resolvePreferredSources(symbol: MarketSymbol): Array<'binance' | 'yahoo' | 'alphaVantage'> {
  if (symbol.category === 'crypto' && symbol.binanceSymbol) {
    return alphaKey() ? ['binance', 'yahoo', 'alphaVantage'] : ['binance', 'yahoo']
  }

  return alphaKey() ? ['yahoo', 'alphaVantage'] : ['yahoo']
}

async function fetchYahooHistory(symbol: MarketSymbol, timeframe: SupportedTimeframe): Promise<ServerOHLCV[]> {
  const config = TIMEFRAME_CONFIG[timeframe]
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol.yahooSymbol)}`)
  url.searchParams.set('interval', config.yahooInterval)
  url.searchParams.set('range', config.yahooRange)
  url.searchParams.set('includePrePost', 'false')
  url.searchParams.set('events', 'div,splits')

  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Tải lịch sử Yahoo thất bại (${response.status})`)
  }

  const payload = await response.json() as Record<string, any>
  const result = payload.chart?.result?.[0]
  const timestamps: number[] = result?.timestamp ?? []
  const quote = result?.indicators?.quote?.[0]
  const candles = timestamps
    .map((time, index) => ({
      time: time * 1000,
      open: safeNumber(quote?.open?.[index]),
      high: safeNumber(quote?.high?.[index]),
      low: safeNumber(quote?.low?.[index]),
      close: safeNumber(quote?.close?.[index]),
      volume: safeNumber(quote?.volume?.[index]),
    }))
    .filter((item) => item.open && item.high && item.low && item.close)

  return clampCandles(sortCandles(candles), config.limit)
}

async function fetchBinanceHistory(symbol: MarketSymbol, timeframe: SupportedTimeframe): Promise<ServerOHLCV[]> {
  if (!symbol.binanceSymbol) {
    throw new Error('Thiếu mã ánh xạ Binance')
  }

  const config = TIMEFRAME_CONFIG[timeframe]
  const url = new URL('https://api.binance.com/api/v3/klines')
  url.searchParams.set('symbol', symbol.binanceSymbol.toUpperCase())
  url.searchParams.set('interval', config.binanceInterval)
  url.searchParams.set('limit', String(config.limit))

  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Tải lịch sử Binance thất bại (${response.status})`)
  }

  const rows = (await response.json()) as Array<[number, string, string, string, string, string]>
  const candles = rows.map((row) => ({
    time: row[0],
    open: safeNumber(row[1]),
    high: safeNumber(row[2]),
    low: safeNumber(row[3]),
    close: safeNumber(row[4]),
    volume: safeNumber(row[5]),
  }))

  return sortCandles(candles)
}

async function fetchAlphaVantageHistory(symbol: MarketSymbol, timeframe: SupportedTimeframe): Promise<ServerOHLCV[]> {
  const key = alphaKey()
  if (!key) {
    throw new Error('Thiếu khóa Alpha Vantage')
  }

  const config = TIMEFRAME_CONFIG[timeframe]
  const isDaily = ['1D', '1W', '2W', '1M', '2M', '3M', '6M', '1Y', '2Y', '3Y'].includes(timeframe)
  const url = new URL('https://www.alphavantage.co/query')
  if (isDaily) {
    url.searchParams.set('function', 'TIME_SERIES_DAILY_ADJUSTED')
    url.searchParams.set('symbol', symbol.alphaVantageSymbol ?? symbol.id)
    url.searchParams.set('outputsize', 'full')
  } else {
    url.searchParams.set('function', 'TIME_SERIES_INTRADAY')
    url.searchParams.set('symbol', symbol.alphaVantageSymbol ?? symbol.id)
    url.searchParams.set('interval', config.alphaInterval)
    url.searchParams.set('outputsize', 'full')
  }
  url.searchParams.set('apikey', key)

  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Tải lịch sử Alpha Vantage thất bại (${response.status})`)
  }

  const payload = await response.json() as Record<string, Record<string, Record<string, string>>>
  const rootKey = Object.keys(payload).find((item) => item.startsWith('Time Series'))
  const series = payload[rootKey ?? ''] ?? {}
  const candles = Object.entries(series).map(([time, row]) => ({
    time: new Date(time).getTime(),
    open: safeNumber(row['1. open']),
    high: safeNumber(row['2. high']),
    low: safeNumber(row['3. low']),
    close: safeNumber(row['4. close']),
    volume: safeNumber(row['6. volume'] ?? row['5. volume']),
  }))

  return clampCandles(sortCandles(candles), config.limit)
}

export async function fetchHistoricalCandles(symbol: MarketSymbol, timeframe: SupportedTimeframe) {
  const sources = resolvePreferredSources(symbol)
  let lastError: unknown

  for (const source of sources) {
    try {
      if (source === 'binance') {
        return await fetchBinanceHistory(symbol, timeframe)
      }

      if (source === 'yahoo') {
        return await fetchYahooHistory(symbol, timeframe)
      }

      return await fetchAlphaVantageHistory(symbol, timeframe)
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Không thể tải dữ liệu nến lịch sử')
}

export function parseSupportedTimeframes(value?: string | null) {
  const requested = value
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean) as SupportedTimeframe[] | undefined

  return requested?.length ? requested : DEFAULT_SYNC_TIMEFRAMES
}

export function parseSyncSymbols(value?: string | null) {
  const ids = value
    ?.split(',')
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean) ?? DEFAULT_SYNC_SYMBOLS

  return ids
    .map((item) => marketById(item))
    .filter((item): item is MarketSymbol => Boolean(item))
}
