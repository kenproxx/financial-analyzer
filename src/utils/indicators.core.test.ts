import { describe, expect, it } from 'vitest'
import { ADX, ATR, BollingerBands, EMA, MACD, RSI, SMA, Stochastic } from 'technicalindicators'
import type { OHLCV } from '../types/market'
import { calculateIndicatorSet } from './indicators'

function approxEqual(actual: number | null | undefined, expected: number | null | undefined, tolerance = 1e-6) {
  if (actual == null || expected == null) {
    expect(actual).toBe(expected)
    return
  }

  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance)
}

const candles: OHLCV[] = Array.from({ length: 80 }, (_, index) => {
  const base = 100 + index * 0.8 + Math.sin(index / 3) * 2
  return {
    time: index * 60_000,
    open: base - 0.7,
    high: base + 1.8,
    low: base - 1.9,
    close: base + Math.cos(index / 5),
    volume: 1_000 + index * 12,
  }
})

describe('calculateIndicatorSet core verification', () => {
  it('matches SMA and EMA tails with technicalindicators', () => {
    const result = calculateIndicatorSet(candles)
    const close = candles.map((item) => item.close)

    const expectedSma20 = SMA.calculate({ values: close, period: 20 }).at(-1) ?? null
    const expectedEma21 = EMA.calculate({ values: close, period: 21 }).at(-1) ?? null

    approxEqual(result.summaries.sma20.current as number | null, expectedSma20)
    approxEqual(result.summaries.ema21.current as number | null, expectedEma21)
  })

  it('matches RSI, ATR and MACD tails with technicalindicators', () => {
    const result = calculateIndicatorSet(candles)
    const close = candles.map((item) => item.close)
    const high = candles.map((item) => item.high)
    const low = candles.map((item) => item.low)

    const expectedRsi = RSI.calculate({ values: close, period: 14 }).at(-1) ?? null
    const expectedAtr = ATR.calculate({ high, low, close, period: 14 }).at(-1) ?? null
    const expectedMacd =
      MACD.calculate({
        values: close,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        SimpleMAOscillator: false,
        SimpleMASignal: false,
      }).at(-1)?.MACD ?? null

    approxEqual(result.summaries.rsi.current as number | null, expectedRsi)
    approxEqual(result.summaries.atr.current as number | null, expectedAtr)
    approxEqual(result.summaries.macd.current as number | null, expectedMacd)
  })

  it('matches ADX, Stochastic and Bollinger-derived tail values with technicalindicators', () => {
    const result = calculateIndicatorSet(candles)
    const close = candles.map((item) => item.close)
    const high = candles.map((item) => item.high)
    const low = candles.map((item) => item.low)

    const expectedAdx = ADX.calculate({ high, low, close, period: 14 }).at(-1)?.adx ?? null
    const expectedStochK = Stochastic.calculate({ high, low, close, period: 14, signalPeriod: 3 }).at(-1)?.k ?? null

    const bb = BollingerBands.calculate({ values: close, period: 20, stdDev: 2 }).at(-1)
    const expectedBbPercentB = bb ? (bb.upper === bb.lower ? null : (close.at(-1)! - bb.lower) / (bb.upper - bb.lower)) : null

    approxEqual(result.summaries.adx.current as number | null, expectedAdx)
    approxEqual(result.summaries.stoch.current as number | null, expectedStochK)
    approxEqual(result.summaries.bollinger.current as number | null, expectedBbPercentB)
  })
})
