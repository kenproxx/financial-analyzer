import axios from 'axios'
import { MARKETS } from '../constants/markets'
import type { DataSourceKind, HistoryRequest, MarketSymbol, OHLCV, PriceSnapshot, SupportedTimeframe } from '../types/market'

interface TimeframeConfig {
  yahooInterval: string
  yahooRange: string
  binanceInterval: string
  alphaInterval: string
  limit: number
}

const TIMEFRAME_CONFIG: Record<SupportedTimeframe, TimeframeConfig> = {
  '5m': { yahooInterval: '5m', yahooRange: '5d', binanceInterval: '5m', alphaInterval: '5min', limit: 500 },
  '15m': { yahooInterval: '15m', yahooRange: '1mo', binanceInterval: '15m', alphaInterval: '15min', limit: 500 },
  '30m': { yahooInterval: '30m', yahooRange: '1mo', binanceInterval: '30m', alphaInterval: '30min', limit: 500 },
  '1h': { yahooInterval: '60m', yahooRange: '3mo', binanceInterval: '1h', alphaInterval: '60min', limit: 500 },
  '2h': { yahooInterval: '1d', yahooRange: '6mo', binanceInterval: '2h', alphaInterval: '60min', limit: 500 },
  '4h': { yahooInterval: '1d', yahooRange: '1y', binanceInterval: '4h', alphaInterval: '60min', limit: 500 },
  '1D': { yahooInterval: '1d', yahooRange: '2y', binanceInterval: '1d', alphaInterval: 'daily', limit: 500 },
  '1W': { yahooInterval: '1wk', yahooRange: '5y', binanceInterval: '1w', alphaInterval: 'weekly', limit: 500 },
  '2W': { yahooInterval: '1wk', yahooRange: '10y', binanceInterval: '1w', alphaInterval: 'weekly', limit: 500 },
  '1M': { yahooInterval: '1mo', yahooRange: '10y', binanceInterval: '1M', alphaInterval: 'monthly', limit: 500 },
  '2M': { yahooInterval: '1mo', yahooRange: '10y', binanceInterval: '1M', alphaInterval: 'monthly', limit: 500 },
  '3M': { yahooInterval: '3mo', yahooRange: '10y', binanceInterval: '1M', alphaInterval: 'monthly', limit: 500 },
  '6M': { yahooInterval: '3mo', yahooRange: 'max', binanceInterval: '1M', alphaInterval: 'monthly', limit: 500 },
  '1Y': { yahooInterval: '3mo', yahooRange: 'max', binanceInterval: '1M', alphaInterval: 'monthly', limit: 500 },
  '2Y': { yahooInterval: '3mo', yahooRange: 'max', binanceInterval: '1M', alphaInterval: 'monthly', limit: 500 },
  '3Y': { yahooInterval: '3mo', yahooRange: 'max', binanceInterval: '1M', alphaInterval: 'monthly', limit: 500 },
}

const YAHOO_BASE = '/api/yahoo'
const BINANCE_BASE = '/api/binance'
const ALPHA_BASE = '/api/alpha'

function safeNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function sortCandles(candles: OHLCV[]) {
  return [...candles].sort((a, b) => a.time - b.time)
}

function clampCandles(candles: OHLCV[], limit = 500) {
  return candles.slice(-limit)
}

export function timeframeConfig(timeframe: SupportedTimeframe) {
  return TIMEFRAME_CONFIG[timeframe]
}

export function marketById(symbolId: string) {
  return MARKETS.find((item) => item.id === symbolId)
}

export function marketByBinanceSymbol(binanceSymbol: string) {
  const normalized = binanceSymbol.trim().toLowerCase()
  return MARKETS.find((item) => item.binanceSymbol?.toLowerCase() === normalized)
}

export function buildCacheKey(symbol: string, timeframe: SupportedTimeframe) {
  return `${symbol}:${timeframe}`
}

export function resolvePreferredSources(symbol: MarketSymbol, hasFinnhubKey: boolean, hasAlphaKey: boolean): DataSourceKind[] {
  if (symbol.category === 'crypto' && symbol.binanceSymbol) {
    const sources: DataSourceKind[] = ['binance', 'yahoo']
    if (hasAlphaKey) {
      sources.push('alphaVantage')
    }
    return sources
  }

  if ((symbol.category === 'forex' || symbol.category === 'commodity') && symbol.finnhubSymbol && hasFinnhubKey) {
    const sources: DataSourceKind[] = ['finnhub', 'yahoo']
    if (hasAlphaKey) {
      sources.push('alphaVantage')
    }
    return sources
  }

  const sources: DataSourceKind[] = ['yahoo']
  if (hasAlphaKey) {
    sources.push('alphaVantage')
  }
  return sources
}

async function fetchYahooHistory({ symbol, timeframe, limit }: HistoryRequest): Promise<OHLCV[]> {
  const config = timeframeConfig(timeframe)
  const response = await axios.get(`${YAHOO_BASE}/v8/finance/chart/${encodeURIComponent(symbol.yahooSymbol)}`, {
    params: {
      interval: config.yahooInterval,
      range: config.yahooRange,
      includePrePost: false,
      events: 'div,splits',
    },
  })

  const result = response.data.chart?.result?.[0]
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

  return clampCandles(sortCandles(candles), limit ?? config.limit)
}

async function fetchBinanceHistory({ symbol, timeframe, limit }: HistoryRequest): Promise<OHLCV[]> {
  if (!symbol.binanceSymbol) {
    throw new Error('Missing Binance symbol mapping')
  }

  const config = timeframeConfig(timeframe)
  const response = await axios.get(`${BINANCE_BASE}/api/v3/klines`, {
    params: {
      symbol: symbol.binanceSymbol.toUpperCase(),
      interval: config.binanceInterval,
      limit: limit ?? config.limit,
    },
  })

  const candles = (response.data as unknown[]).map((item) => {
    const row = item as [number, string, string, string, string, string]
    return {
      time: row[0],
      open: safeNumber(row[1]),
      high: safeNumber(row[2]),
      low: safeNumber(row[3]),
      close: safeNumber(row[4]),
      volume: safeNumber(row[5]),
    }
  })

  return sortCandles(candles)
}

async function fetchAlphaVantageHistory({ symbol, timeframe, settings, limit }: HistoryRequest): Promise<OHLCV[]> {
  if (!settings.alphaVantageKey) {
    throw new Error('Missing Alpha Vantage key')
  }

  const config = timeframeConfig(timeframe)
  const isDaily = ['1D', '1W', '2W', '1M', '2M', '3M', '6M', '1Y', '2Y', '3Y'].includes(timeframe)
  const params = isDaily
    ? {
        function: 'TIME_SERIES_DAILY_ADJUSTED',
        symbol: symbol.alphaVantageSymbol ?? symbol.id,
        outputsize: 'full',
        apikey: settings.alphaVantageKey,
      }
    : {
        function: 'TIME_SERIES_INTRADAY',
        symbol: symbol.alphaVantageSymbol ?? symbol.id,
        interval: config.alphaInterval,
        outputsize: 'full',
        apikey: settings.alphaVantageKey,
      }

  const response = await axios.get(ALPHA_BASE, { params })
  const rootKey = Object.keys(response.data).find((key) => key.startsWith('Time Series'))
  const series = response.data[rootKey ?? ''] ?? {}
  const candles = Object.entries(series).map(([time, value]) => {
    const row = value as Record<string, string>
    return {
      time: new Date(time).getTime(),
      open: safeNumber(row['1. open']),
      high: safeNumber(row['2. high']),
      low: safeNumber(row['3. low']),
      close: safeNumber(row['4. close']),
      volume: safeNumber(row['6. volume'] ?? row['5. volume']),
    }
  })

  return clampCandles(sortCandles(candles), limit ?? config.limit)
}

export async function fetchHistoricalCandles(request: HistoryRequest) {
  const sources = resolvePreferredSources(
    request.symbol,
    Boolean(request.settings.finnhubKey),
    Boolean(request.settings.alphaVantageKey),
  )

  let lastError: unknown
  for (const source of sources) {
    try {
      if (source === 'binance') {
        return await fetchBinanceHistory(request)
      }

      if (source === 'yahoo') {
        return await fetchYahooHistory(request)
      }

      if (source === 'alphaVantage') {
        return await fetchAlphaVantageHistory(request)
      }
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Unable to fetch history')
}

async function fetchQuoteFromYahoo(symbol: MarketSymbol): Promise<PriceSnapshot> {
  const candles = await fetchYahooHistory({
    symbol,
    timeframe: '5m',
    settings: {
      alphaVantageKey: '',
      finnhubKey: '',
      openAiKey: '',
      openAiModel: 'gpt-4o',
      theme: 'dark',
      multiChartCount: 2,
    },
    limit: 2,
  })

  const previous = candles.at(-2)
  const current = candles.at(-1)
  if (!current) {
    throw new Error('Yahoo quote unavailable')
  }

  return {
    symbol: symbol.id,
    price: current.close,
    changePercent: previous ? ((current.close - previous.close) / previous.close) * 100 : 0,
    source: 'yahoo',
    timestamp: current.time,
    volume: current.volume,
  }
}

async function fetchQuoteFromBinance(symbol: MarketSymbol): Promise<PriceSnapshot> {
  if (!symbol.binanceSymbol) {
    throw new Error('Missing Binance symbol mapping')
  }

  const response = await axios.get(`${BINANCE_BASE}/api/v3/ticker/24hr`, {
    params: { symbol: symbol.binanceSymbol.toUpperCase() },
  })

  return {
    symbol: symbol.id,
    price: safeNumber(response.data.lastPrice),
    changePercent: safeNumber(response.data.priceChangePercent),
    source: 'binance',
    timestamp: Date.now(),
    volume: safeNumber(response.data.volume),
  }
}

async function fetchQuoteFromAlpha(symbol: MarketSymbol, alphaVantageKey: string): Promise<PriceSnapshot> {
  const response = await axios.get(ALPHA_BASE, {
    params: {
      function: 'GLOBAL_QUOTE',
      symbol: symbol.alphaVantageSymbol ?? symbol.id,
      apikey: alphaVantageKey,
    },
  })

  const quote = response.data['Global Quote']
  return {
    symbol: symbol.id,
    price: safeNumber(quote?.['05. price']),
    changePercent: safeNumber(String(quote?.['10. change percent'] ?? '').replace('%', '')),
    source: 'alphaVantage',
    timestamp: Date.now(),
    volume: safeNumber(quote?.['06. volume']),
  }
}

export async function fetchLatestQuote(symbol: MarketSymbol, settings: HistoryRequest['settings']) {
  const sources = resolvePreferredSources(symbol, Boolean(settings.finnhubKey), Boolean(settings.alphaVantageKey))

  let lastError: unknown
  for (const source of sources) {
    try {
      if (source === 'binance') {
        return await fetchQuoteFromBinance(symbol)
      }

      if (source === 'yahoo') {
        return await fetchQuoteFromYahoo(symbol)
      }

      if (source === 'alphaVantage') {
        return await fetchQuoteFromAlpha(symbol, settings.alphaVantageKey)
      }
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Unable to fetch latest quote')
}

export function convertBinanceKline(payload: Record<string, unknown>): OHLCV | null {
  const kline = payload.k as Record<string, unknown> | undefined
  if (!kline) {
    return null
  }

  return {
    time: safeNumber(kline.t),
    open: safeNumber(kline.o),
    high: safeNumber(kline.h),
    low: safeNumber(kline.l),
    close: safeNumber(kline.c),
    volume: safeNumber(kline.v),
  }
}

export function parseFinnhubQuote(payload: Record<string, unknown>) {
  const rows = Array.isArray(payload.data) ? payload.data : []
  return rows
    .map((row) => {
      const quote = row as Record<string, unknown>
      const target = MARKETS.find((item) => item.finnhubSymbol === quote.s)
      return target
        ? {
            symbol: target.id,
            price: safeNumber(quote.p),
            changePercent: 0,
            source: 'finnhub' as const,
            timestamp: safeNumber(quote.t),
            volume: safeNumber(quote.v),
          }
        : null
    })
    .filter(Boolean) as PriceSnapshot[]
}

export function realtimePollingSymbols(symbols: MarketSymbol[]) {
  return symbols.filter((item) => item.category !== 'crypto')
}
