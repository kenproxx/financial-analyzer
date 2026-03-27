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

const manualHammerWindow: OHLCV[] = [
  { time: 1, open: 110, high: 111, low: 107, close: 108, volume: 1000 },
  { time: 2, open: 108, high: 109, low: 104, close: 105, volume: 1000 },
  { time: 3, open: 105, high: 106, low: 101, close: 102, volume: 1000 },
  { time: 4, open: 102, high: 103, low: 98, close: 99, volume: 1000 },
  { time: 5, open: 99, high: 99.4, low: 92.5, close: 99.25, volume: 1000 },
]

const manualShootingStarWindow: OHLCV[] = [
  { time: 1, open: 100, high: 103, low: 99, close: 102, volume: 1000 },
  { time: 2, open: 102, high: 106, low: 101, close: 105, volume: 1000 },
  { time: 3, open: 105, high: 109, low: 104, close: 108, volume: 1000 },
  { time: 4, open: 108, high: 112, low: 107, close: 111, volume: 1000 },
  { time: 5, open: 111.2, high: 118, low: 110.9, close: 111.0, volume: 1000 },
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

  it('detects manual hammer fallback with bearish context and clear lower wick', () => {
    const patterns = detectPatterns(manualHammerWindow)
    expect(patterns.hammer).toBe('hammer')
  })

  it('detects manual shooting star fallback with bullish context and clear upper wick', () => {
    const patterns = detectPatterns(manualShootingStarWindow)
    expect(patterns.hammer).toBe('shootingStar')
  })
})
