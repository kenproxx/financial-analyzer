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
})
