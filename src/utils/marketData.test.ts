import { describe, expect, it } from 'vitest'
import { parseFinnhubQuote, resolvePreferredSources } from './marketData'

const cryptoSymbol = {
  id: 'BTCUSD',
  label: 'Bitcoin / US Dollar',
  category: 'crypto',
  yahooSymbol: 'BTC-USD',
  binanceSymbol: 'btcusdt',
  precision: 2,
} as const

const forexSymbol = {
  id: 'EURUSD',
  label: 'Euro / US Dollar',
  category: 'forex',
  yahooSymbol: 'EURUSD=X',
  finnhubSymbol: 'OANDA:EUR_USD',
  precision: 5,
} as const

describe('resolvePreferredSources', () => {
  it('prefers Binance first for crypto symbols', () => {
    expect(resolvePreferredSources(cryptoSymbol, false, true)).toEqual(['binance', 'yahoo', 'alphaVantage'])
  })

  it('prefers Finnhub first for forex when key exists', () => {
    expect(resolvePreferredSources(forexSymbol, true, false)).toEqual(['finnhub', 'yahoo'])
  })
})

describe('parseFinnhubQuote', () => {
  it('maps supported Finnhub payload rows into price snapshots', () => {
    const parsed = parseFinnhubQuote({
      data: [
        { s: 'OANDA:EUR_USD', p: 1.0832, t: 1710000000000, v: 123 },
        { s: 'UNKNOWN', p: 10, t: 1710000000000, v: 5 },
      ],
    })

    expect(parsed).toHaveLength(1)
    expect(parsed[0]).toMatchObject({
      symbol: 'EURUSD',
      price: 1.0832,
      source: 'finnhub',
      timestamp: 1710000000000,
      volume: 123,
    })
  })
})
