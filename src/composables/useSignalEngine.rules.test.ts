import { describe, expect, it } from 'vitest'
import type { AnalysisResult } from '../types/market'
import { buildSignals } from './useSignalEngine'

function createBaseResult(close = 105): Omit<AnalysisResult, 'signals' | 'aggregate'> {
  return {
    symbol: 'BTCUSD',
    timeframe: '1h',
    computedAt: Date.now(),
    series: {},
    summaries: {
      lastClose: { current: close },
    },
  }
}

describe('buildSignals rule coverage', () => {
  it('maps Bollinger %B thresholds to buy/sell', () => {
    const buyResult = createBaseResult()
    buyResult.summaries.bollinger = { current: 0 }
    expect(buildSignals(buyResult, ['bollinger']).signals[0].bias).toBe('buy')

    const sellResult = createBaseResult()
    sellResult.summaries.bollinger = { current: 1 }
    expect(buildSignals(sellResult, ['bollinger']).signals[0].bias).toBe('sell')
  })

  it('maps Donchian breakout above upper band to buy', () => {
    const result = createBaseResult(120)
    result.series.donchian = [{ upper: 110, lower: 90, middle: 100 }]

    const signal = buildSignals(result, ['donchian']).signals[0]
    expect(signal.bias).toBe('buy')
    expect(signal.reason).toBe('Breakout theo Donchian')
  })

  it('maps Ichimoku cloud position below cloud to sell', () => {
    const result = createBaseResult(90)
    result.series.ichimoku = [{ spanA: 100, spanB: 105, conversion: 98, base: 99 }]

    const signal = buildSignals(result, ['ichimoku']).signals[0]
    expect(signal.bias).toBe('sell')
    expect(signal.reason).toBe('Vị trí giá so với mây Ichimoku')
  })

  it('maps ADX strong bearish trend to sell', () => {
    const result = createBaseResult()
    result.series.adx = [{ adx: 30, pdi: 12, mdi: 25 }]

    const signal = buildSignals(result, ['adx']).signals[0]
    expect(signal.bias).toBe('sell')
    expect(signal.reason).toBe('Độ mạnh trend theo ADX')
  })

  it('maps stochastic oversold threshold to buy', () => {
    const result = createBaseResult()
    result.summaries.stoch = { current: 15 }

    const signal = buildSignals(result, ['stoch']).signals[0]
    expect(signal.bias).toBe('buy')
    expect(signal.reason).toBe('Dao động ngắn hạn')
  })

  it('maps Williams %R overbought threshold to sell', () => {
    const result = createBaseResult()
    result.summaries.williamsR = { current: -10 }

    const signal = buildSignals(result, ['williamsR']).signals[0]
    expect(signal.bias).toBe('sell')
    expect(signal.reason).toBe('Ngưỡng Williams %R')
  })

  it('maps OBV rising flow to buy', () => {
    const result = createBaseResult()
    result.series.obv = [1000, 1200]

    const signal = buildSignals(result, ['obv']).signals[0]
    expect(signal.bias).toBe('buy')
    expect(signal.reason).toBe('Dòng tiền OBV')
  })

  it('maps engulfing and hammer summaries to directional biases', () => {
    const engulfing = createBaseResult()
    engulfing.summaries.engulfing = { current: 'bearish' }
    expect(buildSignals(engulfing, ['engulfing']).signals[0].bias).toBe('sell')

    const hammer = createBaseResult()
    hammer.summaries.hammer = { current: 'hammer' }
    expect(buildSignals(hammer, ['hammer']).signals[0].bias).toBe('buy')
  })

  it('maps Guppy short pack above long pack to buy', () => {
    const result = createBaseResult()
    result.summaries.guppy = { current: 120, detail: 'Long 110' }

    const signal = buildSignals(result, ['guppy']).signals[0]
    expect(signal.bias).toBe('buy')
    expect(signal.reason).toBe('Tương quan EMA ngắn/dài')
  })

  it('produces buy conclusion when buy ratio crosses 0.55 but not 0.7', () => {
    const result = createBaseResult()
    result.summaries.rsi = { current: 20 }
    result.summaries.ema9 = { current: 90 }
    result.summaries.stoch = { current: 10 }
    result.summaries.cmf = { current: 0 }

    const output = buildSignals(result, ['rsi', 'ema9', 'stoch', 'cmf'])
    expect(output.aggregate.buy).toBe(3)
    expect(output.aggregate.total).toBe(4)
    expect(output.aggregate.conclusion).toBe('strongBuy')
  })

  it('produces sell conclusion when sell ratio crosses 0.55 but not 0.7', () => {
    const result = createBaseResult(80)
    result.summaries.ema9 = { current: 100 }
    result.summaries.rsi = { current: 75 }
    result.summaries.stoch = { current: 50 }
    result.summaries.cmf = { current: -0.2 }

    const output = buildSignals(result, ['ema9', 'rsi', 'stoch', 'cmf'])
    expect(output.aggregate.sell).toBe(3)
    expect(output.aggregate.total).toBe(4)
    expect(output.aggregate.conclusion).toBe('strongSell')
  })
})
