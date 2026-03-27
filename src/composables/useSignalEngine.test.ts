import { describe, expect, it } from 'vitest'
import type { AnalysisResult } from '../types/market'
import { buildSignals } from './useSignalEngine'

function createBaseResult(): Omit<AnalysisResult, 'signals' | 'aggregate'> {
  return {
    symbol: 'BTCUSD',
    timeframe: '1h',
    computedAt: Date.now(),
    series: {},
    summaries: {
      lastClose: { current: 105 },
      rsi: { current: 25 },
      ema9: { current: 100 },
      macd: { current: 1.2 },
    },
  }
}

describe('buildSignals', () => {
  it('builds bullish aggregate when enabled indicators align', () => {
    const result = createBaseResult()
    result.series.macd = [
      { MACD: 0.8, signal: 1.0 },
      { MACD: 1.2, signal: 1.0 },
    ]

    const output = buildSignals(result, ['rsi', 'ema9', 'macd'])

    expect(output.signals).toHaveLength(3)
    expect(output.aggregate.buy).toBe(3)
    expect(output.aggregate.sell).toBe(0)
    expect(output.aggregate.conclusion).toBe('strongBuy')
  })

  it('returns neutral aggregate when no indicator is enabled', () => {
    const output = buildSignals(createBaseResult(), [])

    expect(output.signals).toHaveLength(0)
    expect(output.aggregate.buy).toBe(0)
    expect(output.aggregate.sell).toBe(0)
    expect(output.aggregate.neutral).toBe(0)
    expect(output.aggregate.conclusion).toBe('neutral')
  })

  it('maps trend-following indicators to buy when close is above trend line', () => {
    const result = createBaseResult()
    result.summaries.ema9 = { current: 100 }

    const output = buildSignals(result, ['ema9'])

    expect(output.signals[0]).toMatchObject({
      key: 'ema9',
      bias: 'buy',
      reason: 'Giá nằm phía trên đường xu hướng',
    })
  })

  it('maps RSI overbought threshold to sell', () => {
    const result = createBaseResult()
    result.summaries.rsi = { current: 75 }

    const output = buildSignals(result, ['rsi'])

    expect(output.signals[0]).toMatchObject({
      key: 'rsi',
      bias: 'sell',
      reason: 'Vùng overbought/oversold',
    })
  })

  it('maps MACD bearish crossover to sell', () => {
    const result = createBaseResult()
    result.series.macd = [
      { MACD: 1.2, signal: 1.0 },
      { MACD: 0.8, signal: 1.1 },
    ]

    const output = buildSignals(result, ['macd'])

    expect(output.signals[0]).toMatchObject({
      key: 'macd',
      bias: 'sell',
      reason: 'Giao cắt MACD/Signal',
    })
  })

  it('maps CMF positive threshold to buy', () => {
    const result = createBaseResult()
    result.summaries.cmf = { current: 0.25 }

    const output = buildSignals(result, ['cmf'])

    expect(output.signals[0]).toMatchObject({
      key: 'cmf',
      bias: 'buy',
      reason: 'Áp lực mua/bán theo CMF',
    })
  })
})
