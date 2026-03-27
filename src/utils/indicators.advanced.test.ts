import { describe, expect, it } from 'vitest'
import { EMA, SMA, WMA } from 'technicalindicators'
import type { OHLCV } from '../types/market'

function align(values: number[], length: number): Array<number | null> {
  return Array.from({ length: Math.max(length - values.length, 0) }, () => null as number | null).concat(values)
}
import {
  calculateCMF,
  calculateDEMA,
  calculateDPO,
  calculateDonchian,
  calculateHMA,
  calculateSupertrend,
  calculateTEMA,
} from './indicators'

function approxEqual(actual: number | null | undefined, expected: number | null | undefined, tolerance = 1e-6) {
  if (actual == null || expected == null) {
    expect(actual).toBe(expected)
    return
  }

  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance)
}

const candles: OHLCV[] = Array.from({ length: 120 }, (_, index) => {
  const base = 200 + index * 0.65 + Math.sin(index / 4) * 3
  return {
    time: index * 60_000,
    open: base - 1,
    high: base + 2.4,
    low: base - 2.1,
    close: base + Math.cos(index / 6),
    volume: 500 + index * 9,
  }
})

const close = candles.map((item) => item.close)

describe('advanced/custom indicator verification', () => {
  it('matches canonical DEMA and TEMA formulas derived from EMA', () => {
    const dema = calculateDEMA(close, 20)
    const tema = calculateTEMA(close, 20)

    const ema1 = EMA.calculate({ values: close, period: 20 })
    const ema2 = EMA.calculate({ values: ema1, period: 20 })
    const ema3 = EMA.calculate({ values: ema2, period: 20 })

    const expectedDema = 2 * ema1.at(-1)! - ema2.at(-1)!
    const expectedTema = 3 * ema1.at(-1)! - 3 * ema2.at(-1)! + ema3.at(-1)!

    approxEqual(dema.at(-1), expectedDema)
    approxEqual(tema.at(-1), expectedTema)
  })

  it('matches HMA formula based on nested WMA calculation', () => {
    const period = 20
    const half = Math.floor(period / 2)
    const sqrt = Math.floor(Math.sqrt(period))
    const hma = calculateHMA(close, period)

    const wmaHalf = WMA.calculate({ values: close, period: half })
    const wmaFull = WMA.calculate({ values: close, period })
    const alignedLength = close.length
    const alignedHalf = align(wmaHalf, alignedLength)
    const alignedFull = align(wmaFull, alignedLength)
    const diff = close
      .map((_, index) => {
        const first = alignedHalf[index]
        const second = alignedFull[index]
        return first != null && second != null ? 2 * first - second : null
      })
      .filter((value): value is number => value != null)
    const expected = WMA.calculate({ values: diff, period: sqrt }).at(-1) ?? null

    approxEqual(hma.at(-1), expected)
  })

  it('calculates Donchian and DPO according to rolling-window definitions', () => {
    const donchian = calculateDonchian(candles, 20)
    const dpo = calculateDPO(close, 20)

    const donchianWindow = candles.slice(-20)
    const expectedUpper = Math.max(...donchianWindow.map((item) => item.high))
    const expectedLower = Math.min(...donchianWindow.map((item) => item.low))
    const expectedMiddle = (expectedUpper + expectedLower) / 2

    const sma20 = SMA.calculate({ values: close, period: 20 })
    const offset = Math.floor(20 / 2) + 1
    const alignedSma = align(sma20, close.length)
    const expectedDpo = alignedSma[close.length - 1 - offset] == null ? null : close.at(-1)! - alignedSma[close.length - 1 - offset]!

    approxEqual(donchian.at(-1)?.upper, expectedUpper)
    approxEqual(donchian.at(-1)?.lower, expectedLower)
    approxEqual(donchian.at(-1)?.middle, expectedMiddle)
    approxEqual(dpo.at(-1), expectedDpo)
  })

  it('calculates CMF using money flow volume over rolling period', () => {
    const period = 21
    const cmf = calculateCMF(candles, period)
    const window = candles.slice(-period)
    const expected = (() => {
      const totals = window.map((item) => {
        const denominator = item.high - item.low
        const multiplier = denominator === 0 ? 0 : ((item.close - item.low) - (item.high - item.close)) / denominator
        return {
          flow: multiplier * item.volume,
          volume: item.volume,
        }
      })
      const totalFlow = totals.reduce((sum, item) => sum + item.flow, 0)
      const totalVolume = totals.reduce((sum, item) => sum + item.volume, 0)
      return totalVolume === 0 ? 0 : totalFlow / totalVolume
    })()

    approxEqual(cmf.at(-1), expected)
  })

  it('keeps supertrend invariants on completed values', () => {
    const supertrend = calculateSupertrend(candles, 10, 3)
    const completed = supertrend.filter((item) => item.trend != null)

    expect(completed.length).toBeGreaterThan(0)
    completed.forEach((item) => {
      expect(item.upper).not.toBeNull()
      expect(item.lower).not.toBeNull()
      expect(item.trend === item.upper || item.trend === item.lower).toBe(true)
      expect((item.upper ?? 0) >= (item.lower ?? 0)).toBe(true)
    })
  })
})
