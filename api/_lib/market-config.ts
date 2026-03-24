export type AssetCategory = 'crypto' | 'forex' | 'commodity' | 'index' | 'stock'

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
  category: AssetCategory
  yahooSymbol: string
  binanceSymbol?: string
  alphaVantageSymbol?: string
}

interface TimeframeConfig {
  yahooInterval: string
  yahooRange: string
  binanceInterval: string
  alphaInterval: string
  limit: number
}

export const MARKETS: MarketSymbol[] = [
  { id: 'XAUUSD', category: 'commodity', yahooSymbol: 'GC=F' },
  { id: 'XAGUSD', category: 'commodity', yahooSymbol: 'SI=F' },
  { id: 'USOIL', category: 'commodity', yahooSymbol: 'CL=F' },
  { id: 'BRENT', category: 'commodity', yahooSymbol: 'BZ=F' },
  { id: 'BTCUSD', category: 'crypto', yahooSymbol: 'BTC-USD', binanceSymbol: 'btcusdt' },
  { id: 'ETHUSD', category: 'crypto', yahooSymbol: 'ETH-USD', binanceSymbol: 'ethusdt' },
  { id: 'EURUSD', category: 'forex', yahooSymbol: 'EURUSD=X' },
  { id: 'GBPUSD', category: 'forex', yahooSymbol: 'GBPUSD=X' },
  { id: 'VNINDEX', category: 'index', yahooSymbol: '^VNINDEX' },
  { id: 'SP500', category: 'index', yahooSymbol: '^GSPC' },
  { id: 'NASDAQ', category: 'index', yahooSymbol: '^IXIC' },
  { id: 'DOWJONES', category: 'index', yahooSymbol: '^DJI' },
  { id: 'VCB', category: 'stock', yahooSymbol: 'VCB.VN' },
  { id: 'VIC', category: 'stock', yahooSymbol: 'VIC.VN' },
  { id: 'HPG', category: 'stock', yahooSymbol: 'HPG.VN' },
  { id: 'FPT', category: 'stock', yahooSymbol: 'FPT.VN' },
]

export const TIMEFRAME_CONFIG: Record<SupportedTimeframe, TimeframeConfig> = {
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

export const DEFAULT_SYNC_SYMBOLS = ['BTCUSD', 'ETHUSD', 'XAUUSD', 'EURUSD', 'VCB', 'HPG']
export const DEFAULT_SYNC_TIMEFRAMES: SupportedTimeframe[] = ['15m', '1h', '4h', '1D']

export function marketById(symbolId: string) {
  return MARKETS.find((item) => item.id === symbolId)
}
