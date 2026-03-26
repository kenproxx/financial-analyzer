export type AssetCategory =
  | 'crypto'
  | 'forex'
  | 'commodity'
  | 'index'
  | 'stock'

export type DataSourceKind = 'binance' | 'yahoo' | 'finnhub' | 'alphaVantage'

export type SignalBias = 'buy' | 'sell' | 'neutral'

export type SignalStrength = 'strongBuy' | 'buy' | 'neutral' | 'sell' | 'strongSell'

export type IndicatorGroup =
  | 'trend'
  | 'momentum'
  | 'volatility'
  | 'volume'
  | 'pattern'
  | 'support'
  | 'advanced'

export type SupportedTimeframe =
  | '5m'
  | '15m'
  | '30m'
  | '1h'
  | '2h'
  | '4h'
  | '1D'
  | '1W'
  | '2W'
  | '1M'
  | '2M'
  | '3M'
  | '6M'
  | '1Y'
  | '2Y'
  | '3Y'

export interface MarketSymbol {
  id: string
  label: string
  category: AssetCategory
  exchange?: string
  binanceSymbol?: string
  finnhubSymbol?: string
  yahooSymbol: string
  alphaVantageSymbol?: string
  precision: number
  lot?: string
}

export interface OHLCV {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface PriceSnapshot {
  symbol: string
  price: number
  changePercent: number
  source: DataSourceKind
  timestamp: number
  volume?: number
}

export interface PriceAlert {
  id: string
  symbol: string
  target: number
  direction: 'above' | 'below'
  triggeredAt?: number
}

export interface AppSettings {
  finnhubKey: string
  alphaVantageKey: string
  openAiKey: string
  openAiModel: string
  theme: 'dark' | 'light'
  multiChartCount: 1 | 2 | 4
}

export interface IndicatorDescriptor {
  key: string
  label: string
  group: IndicatorGroup
  overlay: boolean
}

export interface IndicatorValueSummary {
  current: number | string | null
  detail?: string
}

export interface IndicatorSignal {
  key: string
  label: string
  group: IndicatorGroup
  currentValue: string
  bias: SignalBias
  reason: string
}

export interface AggregatedSignal {
  buy: number
  sell: number
  neutral: number
  total: number
  buyRatio: number
  sellRatio: number
  conclusion: SignalStrength
}

export interface TimeframeSignalCell {
  symbol: string
  timeframe: SupportedTimeframe
  loading: boolean
  hasData: boolean
  strength: SignalStrength
  updatedAt?: number
  error?: string
}

export interface AnalysisResult {
  symbol: string
  timeframe: SupportedTimeframe
  computedAt: number
  lastClosedTime?: number
  series: Record<string, unknown>
  summaries: Record<string, IndicatorValueSummary>
  signals: IndicatorSignal[]
  aggregate: AggregatedSignal
}

export interface InsightResult {
  symbol: string
  timeframe: SupportedTimeframe
  content: string
  createdAt: number
  loading: boolean
  error?: string
  errorCode?: string
  statusCode?: number
  retryAt?: number
}

export interface HistoryRequest {
  symbol: MarketSymbol
  timeframe: SupportedTimeframe
  settings: AppSettings
  limit?: number
}
