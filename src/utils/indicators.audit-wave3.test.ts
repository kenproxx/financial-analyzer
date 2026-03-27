import { describe, expect, it } from 'vitest'
import type { OHLCV } from '../types/market'
import {
  calculateAroonOscillator,
  calculateCMO,
  calculateHistoricalVolatility,
  calculateUltimateOscillator,
} from './indicators'

function approxEqual(actual: number | null | undefined, expected: number | null | undefined, tolerance = 1e-6) {
  if (actual == null || expected == null) {
    expect(actual).toBe(expected)
    return
  }

  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance)
}

const candles: OHLCV[] = Array.from({ length: 120 }, (_, index) => {
  const base = 300 + index * 0.42 + Math.sin(index / 7) * 5
  return {
    time: index * 60_000,
    open: base - 0.5,
    high: base + 2.8,
    low: base - 2.2,
    close: base + Math.cos(index / 8),
    volume: 800 + index * 7,
  }
})

const close = candles.map((item) => item.close)

describe('wave 3 indicator verification', () => {
  it('calculates Aroon oscillator from rolling high/low positions', () => {
    const period = 25
    const aroon = calculateAroonOscillator(candles, period)
    const window = candles.slice(-period)
    const highest = Math.max(...window.map((item) => item.high))
    const lowest = Math.min(...window.map((item) => item.low))
    const highestIndex = window.findIndex((item) => item.high === highest)
    const lowestIndex = window.findIndex((item) => item.low === lowest)
    const aroonUp = (100 * (period - (period - 1 - highestIndex))) / period
    const aroonDown = (100 * (period - (period - 1 - lowestIndex))) / period
    const expected = aroonUp - aroonDown

    approxEqual(aroon.at(-1), expected)
  })

  it('calculates CMO from rolling gains and losses', () => {
    const period = 14
    const cmo = calculateCMO(close, period)
    const index = close.length - 1
    let gains = 0
    let losses = 0
    for (let pointer = index - period + 1; pointer <= index; pointer += 1) {
      if (pointer === index - period + 1) {
        continue
      }
      const change = close[pointer] - close[pointer - 1]
      if (change > 0) {
        gains += change
      } else {
        losses += Math.abs(change)
      }
    }
    const expected = gains + losses === 0 ? 0 : (100 * (gains - losses)) / (gains + losses)

    approxEqual(cmo.at(-1), expected)
  })

  it('calculates historical volatility from rolling log returns', () => {
    const period = 20
    const hv = calculateHistoricalVolatility(close, period)
    const returns = close.map((value, index) => {
      const previous = close[index - 1]
      return previous ? Math.log(value / previous) : null
    })
    const window = returns.slice(-period).filter((item): item is number => item != null)
    const mean = window.reduce((sum, value) => sum + value, 0) / window.length
    const variance = window.reduce((sum, value) => sum + (value - mean) ** 2, 0) / window.length
    const expected = Math.sqrt(variance) * Math.sqrt(252) * 100

    approxEqual(hv.at(-1), expected)
  })

  it('calculates Ultimate Oscillator from weighted BP/TR averages', () => {
    const ultimate = calculateUltimateOscillator(candles)
    const buyingPressure = candles.map((item, index) => {
      const previous = candles[index - 1]
      const previousClose = previous?.close ?? item.close
      return item.close - Math.min(item.low, previousClose)
    })
    const trueRange = candles.map((item, index) => {
      const previous = candles[index - 1]
      const previousClose = previous?.close ?? item.close
      return Math.max(item.high, previousClose) - Math.min(item.low, previousClose)
    })
    const sumRatio = (a: number[], b: number[], index: number, period: number) => {
      const sliceA = a.slice(index - period + 1, index + 1)
      const sliceB = b.slice(index - period + 1, index + 1)
      const denominator = sliceB.reduce((sum, value) => sum + value, 0)
      return denominator === 0 ? 0 : sliceA.reduce((sum, value) => sum + value, 0) / denominator
    }
    const index = candles.length - 1
    const avg7 = sumRatio(buyingPressure, trueRange, index, 7)
    const avg14 = sumRatio(buyingPressure, trueRange, index, 14)
    const avg28 = sumRatio(buyingPressure, trueRange, index, 28)
    const expected = 100 * ((4 * avg7 + 2 * avg14 + avg28) / 7)

    approxEqual(ultimate.at(-1), expected)
  })
})
