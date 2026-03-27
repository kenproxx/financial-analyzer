import { describe, expect, it } from 'vitest'
import type { OHLCV } from '../types/market'
import { calculateGuppy, calculateSupertrend, detectPatterns } from './indicators'

const bullishTrendCandles: OHLCV[] = Array.from({ length: 40 }, (_, index) => {
  const base = 100 + index * 2
  return {
    time: index,
    open: base,
    high: base + 3,
    low: base - 1,
    close: base + 2,
    volume: 1_000 + index * 10,
  }
})

const bearishTrendCandles: OHLCV[] = Array.from({ length: 40 }, (_, index) => {
  const base = 200 - index * 2
  return {
    time: index,
    open: base,
    high: base + 1,
    low: base - 3,
    close: base - 2,
    volume: 1_000 + index * 10,
  }
})

const manualPatternLimitationWindow: OHLCV[] = [
  { time: 1, open: 110, high: 111, low: 106, close: 107, volume: 1000 },
  { time: 2, open: 108, high: 109, low: 103, close: 104, volume: 1000 },
  { time: 3, open: 105, high: 106, low: 100, close: 101, volume: 1000 },
  { time: 4, open: 101, high: 101.2, low: 94, close: 100.95, volume: 1000 },
]

describe('wave 4 correctness coverage', () => {
  it('keeps supertrend below price in strong bullish trend after warmup', () => {
    const series = calculateSupertrend(bullishTrendCandles, 10, 3)
    const completed = series
      .map((item, index) => ({ ...item, close: bullishTrendCandles[index].close }))
      .filter((item) => item.trend != null)

    expect(completed.length).toBeGreaterThan(0)
    completed.slice(-10).forEach((item) => {
      expect((item.trend ?? 0) <= item.close).toBe(true)
    })
  })

  it('keeps supertrend above price in strong bearish trend after warmup', () => {
    const series = calculateSupertrend(bearishTrendCandles, 10, 3)
    const completed = series
      .map((item, index) => ({ ...item, close: bearishTrendCandles[index].close }))
      .filter((item) => item.trend != null)

    expect(completed.length).toBeGreaterThan(0)
    completed.slice(-10).forEach((item) => {
      expect((item.trend ?? 0) >= item.close).toBe(true)
    })
  })

  it('keeps guppy short/long EMA packs internally ordered on bullish trend', () => {
    const guppy = calculateGuppy(bullishTrendCandles.map((item) => item.close))
    const shortTail = guppy.short.map((series) => series.at(-1) ?? 0)
    const longTail = guppy.long.map((series) => series.at(-1) ?? 0)

    for (let index = 1; index < shortTail.length; index += 1) {
      expect(shortTail[index - 1]).toBeGreaterThanOrEqual(shortTail[index])
    }

    for (let index = 1; index < longTail.length; index += 1) {
      expect(longTail[index - 1]).toBeGreaterThanOrEqual(longTail[index])
    }

    expect(shortTail[0]).toBeGreaterThan(longTail[0])
  })

  it('documents current manual pattern fallback limitation for near-doji reversal candles', () => {
    const patterns = detectPatterns(manualPatternLimitationWindow)
    expect(patterns.doji).toBe(true)
    expect(patterns.hammer).toBe('none')
  })
})
