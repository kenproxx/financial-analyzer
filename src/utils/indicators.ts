import {
  ADX,
  ATR,
  BollingerBands,
  CCI,
  EMA,
  IchimokuCloud,
  MACD,
  MFI,
  OBV,
  PSAR,
  ROC,
  RSI,
  SD,
  SMA,
  Stochastic,
  StochasticRSI,
  TRIX,
  VWAP,
  WMA,
  WilliamsR,
  bearishengulfingpattern,
  bullishengulfingpattern,
  doji,
  hammerpattern,
  keltnerchannels,
  shootingstar,
} from 'technicalindicators'
import type { OHLCV } from '../types/market'

type NullableNumber = number | null

function closeSeries(candles: OHLCV[]) {
  return candles.map((item) => item.close)
}

function openSeries(candles: OHLCV[]) {
  return candles.map((item) => item.open)
}

function highSeries(candles: OHLCV[]) {
  return candles.map((item) => item.high)
}

function lowSeries(candles: OHLCV[]) {
  return candles.map((item) => item.low)
}

function volumeSeries(candles: OHLCV[]) {
  return candles.map((item) => item.volume)
}

function alignNumbers(values: number[], length: number): NullableNumber[] {
  const padding = Math.max(length - values.length, 0)
  return [...Array.from({ length: padding }, () => null as NullableNumber), ...values]
}

function mean(values: number[]) {
  if (!values.length) {
    return 0
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function latest<T>(values: T[]) {
  return values.at(-1)
}

function formatMaybe(value: NullableNumber | undefined) {
  return value == null ? '--' : value.toFixed(2)
}

function slopeFromTail(values: number[], length = 5) {
  const sample = values.slice(-length)
  if (sample.length < 2) {
    return 0
  }

  return sample[sample.length - 1] - sample[0]
}

function sumRatio(a: number[], b: number[], index: number, period: number) {
  const sliceA = a.slice(index - period + 1, index + 1)
  const sliceB = b.slice(index - period + 1, index + 1)
  const denominator = sliceB.reduce((sum, value) => sum + value, 0)
  return denominator === 0 ? 0 : sliceA.reduce((sum, value) => sum + value, 0) / denominator
}

export function calculateDEMA(values: number[], period: number) {
  const ema = EMA.calculate({ values, period })
  const emaOfEma = EMA.calculate({ values: ema, period })
  const alignedEma = alignNumbers(ema, values.length)
  const alignedEmaOfEma = alignNumbers(emaOfEma, values.length)
  return alignedEma.map((item, index) => {
    const second = alignedEmaOfEma[index]
    return item != null && second != null ? 2 * item - second : null
  })
}

export function calculateTEMA(values: number[], period: number) {
  const ema1 = EMA.calculate({ values, period })
  const ema2 = EMA.calculate({ values: ema1, period })
  const ema3 = EMA.calculate({ values: ema2, period })
  const a1 = alignNumbers(ema1, values.length)
  const a2 = alignNumbers(ema2, values.length)
  const a3 = alignNumbers(ema3, values.length)
  return a1.map((value, index) => {
    const second = a2[index]
    const third = a3[index]
    return value != null && second != null && third != null ? 3 * value - 3 * second + third : null
  })
}

export function calculateHMA(values: number[], period: number) {
  const half = Math.max(Math.floor(period / 2), 1)
  const sqrt = Math.max(Math.floor(Math.sqrt(period)), 1)
  const wmaHalf = alignNumbers(WMA.calculate({ values, period: half }), values.length)
  const wmaFull = alignNumbers(WMA.calculate({ values, period }), values.length)
  const diff = values.map((_, index) => {
    const first = wmaHalf[index]
    const second = wmaFull[index]
    return first != null && second != null ? 2 * first - second : null
  })
  const seed = diff.filter((value): value is number => value != null)
  const hma = WMA.calculate({ values: seed, period: sqrt })
  return alignNumbers(hma, values.length)
}

export function calculateMomentum(values: number[], period: number) {
  return values.map((value, index) => (index >= period ? value - values[index - period] : null))
}

export function calculateHistoricalVolatility(values: number[], period: number) {
  const returns = values.map((value, index) => {
    const previous = values[index - 1]
    return previous ? Math.log(value / previous) : null
  })

  return returns.map((_, index) => {
    if (index < period) {
      return null
    }

    const window = returns.slice(index - period + 1, index + 1).filter((item): item is number => item != null)
    const avg = mean(window)
    const variance = mean(window.map((item) => (item - avg) ** 2))
    return Math.sqrt(variance) * Math.sqrt(252) * 100
  })
}

export function calculateCMF(candles: OHLCV[], period = 21) {
  const flows = candles.map((item) => {
    const denominator = item.high - item.low
    const multiplier = denominator === 0 ? 0 : ((item.close - item.low) - (item.high - item.close)) / denominator
    return {
      flow: multiplier * item.volume,
      volume: item.volume,
    }
  })

  return flows.map((_, index) => {
    if (index + 1 < period) {
      return null
    }

    const window = flows.slice(index - period + 1, index + 1)
    const moneyFlow = window.reduce((sum, item) => sum + item.flow, 0)
    const volume = window.reduce((sum, item) => sum + item.volume, 0)
    return volume === 0 ? 0 : moneyFlow / volume
  })
}

export function calculateVolumeSma(values: number[], period: number) {
  return alignNumbers(SMA.calculate({ values, period }), values.length)
}

export function calculateVWMA(candles: OHLCV[], period: number) {
  return candles.map((_, index) => {
    if (index + 1 < period) {
      return null
    }

    const window = candles.slice(index - period + 1, index + 1)
    const numerator = window.reduce((sum, item) => sum + item.close * item.volume, 0)
    const denominator = window.reduce((sum, item) => sum + item.volume, 0)
    return denominator === 0 ? null : numerator / denominator
  })
}

export function calculateDonchian(candles: OHLCV[], period = 20) {
  return candles.map((_, index) => {
    if (index + 1 < period) {
      return { upper: null, lower: null, middle: null }
    }

    const window = candles.slice(index - period + 1, index + 1)
    const upper = Math.max(...window.map((item) => item.high))
    const lower = Math.min(...window.map((item) => item.low))
    return { upper, lower, middle: (upper + lower) / 2 }
  })
}

export function calculateUltimateOscillator(candles: OHLCV[]) {
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

  return candles.map((_, index) => {
    if (index < 27) {
      return null
    }

    const avg7 = sumRatio(buyingPressure, trueRange, index, 7)
    const avg14 = sumRatio(buyingPressure, trueRange, index, 14)
    const avg28 = sumRatio(buyingPressure, trueRange, index, 28)
    return 100 * ((4 * avg7 + 2 * avg14 + avg28) / 7)
  })
}

export function calculatePivotPoints(candles: OHLCV[]) {
  const last = candles.at(-1)
  if (!last) {
    return null
  }

  const pp = (last.high + last.low + last.close) / 3
  return {
    pp,
    r1: 2 * pp - last.low,
    r2: pp + (last.high - last.low),
    r3: last.high + 2 * (pp - last.low),
    s1: 2 * pp - last.high,
    s2: pp - (last.high - last.low),
    s3: last.low - 2 * (last.high - pp),
  }
}

export function calculateFibonacci(candles: OHLCV[], length = 100) {
  const window = candles.slice(-length)
  if (!window.length) {
    return null
  }

  const swingHigh = Math.max(...window.map((item) => item.high))
  const swingLow = Math.min(...window.map((item) => item.low))
  const range = swingHigh - swingLow

  return {
    high: swingHigh,
    low: swingLow,
    levels: {
      '23.6%': swingHigh - range * 0.236,
      '38.2%': swingHigh - range * 0.382,
      '50.0%': swingHigh - range * 0.5,
      '61.8%': swingHigh - range * 0.618,
      '78.6%': swingHigh - range * 0.786,
    },
  }
}

export function calculateSupertrend(candles: OHLCV[], period = 10, factor = 3) {
  const atr = alignNumbers(
    ATR.calculate({
      high: highSeries(candles),
      low: lowSeries(candles),
      close: closeSeries(candles),
      period,
    }),
    candles.length,
  )

  const series: Array<{ upper: NullableNumber; lower: NullableNumber; trend: NullableNumber }> = []

  candles.forEach((candle, index) => {
    const currentAtr = atr[index]
    if (currentAtr == null) {
      series.push({ upper: null, lower: null, trend: null })
      return
    }

    const hl2 = (candle.high + candle.low) / 2
    const basicUpper = hl2 + factor * currentAtr
    const basicLower = hl2 - factor * currentAtr
    const previous: { upper: NullableNumber; lower: NullableNumber; trend: NullableNumber } | undefined =
      index > 0 ? series[index - 1] : undefined
    const previousClose = candles[index - 1]?.close ?? candle.close
    const finalUpper =
      previous?.upper == null || basicUpper < previous.upper || previousClose > previous.upper
        ? basicUpper
        : previous.upper
    const finalLower =
      previous?.lower == null || basicLower > previous.lower || previousClose < previous.lower
        ? basicLower
        : previous.lower
    const trend =
      previous?.trend == null
        ? candle.close >= finalLower
          ? finalLower
          : finalUpper
        : previous.trend === previous.upper
          ? candle.close <= finalUpper
            ? finalUpper
            : finalLower
          : candle.close >= finalLower
            ? finalLower
            : finalUpper

    series.push({
      upper: finalUpper,
      lower: finalLower,
      trend,
    })
  })

  return series
}

export function calculateAroonOscillator(candles: OHLCV[], period = 25) {
  return candles.map((_, index) => {
    if (index + 1 < period) {
      return null
    }

    const window = candles.slice(index - period + 1, index + 1)
    const highest = Math.max(...window.map((item) => item.high))
    const lowest = Math.min(...window.map((item) => item.low))
    const highestIndex = window.findIndex((item) => item.high === highest)
    const lowestIndex = window.findIndex((item) => item.low === lowest)
    const aroonUp = (100 * (period - (period - 1 - highestIndex))) / period
    const aroonDown = (100 * (period - (period - 1 - lowestIndex))) / period
    return aroonUp - aroonDown
  })
}

export function calculateCMO(values: number[], period = 14) {
  return values.map((_, index) => {
    if (index < period) {
      return null
    }

    let gains = 0
    let losses = 0
    for (let pointer = index - period + 1; pointer <= index; pointer += 1) {
      if (pointer === index - period + 1) {
        continue
      }

      const change = values[pointer] - values[pointer - 1]
      if (change > 0) {
        gains += change
      } else {
        losses += Math.abs(change)
      }
    }

    const denominator = gains + losses
    return denominator === 0 ? 0 : (100 * (gains - losses)) / denominator
  })
}

export function calculateElderRay(candles: OHLCV[], period = 13) {
  const ema = alignNumbers(EMA.calculate({ values: closeSeries(candles), period }), candles.length)
  return candles.map((item, index) => {
    const base = ema[index]
    return {
      bull: base == null ? null : item.high - base,
      bear: base == null ? null : item.low - base,
    }
  })
}

export function calculateDPO(values: number[], period = 20) {
  const sma = alignNumbers(SMA.calculate({ values, period }), values.length)
  const offset = Math.floor(period / 2) + 1
  return values.map((value, index) => {
    const displaced = sma[index - offset]
    return displaced == null ? null : value - displaced
  })
}

export function calculateGuppy(values: number[]) {
  const shortPeriods = [3, 5, 8, 10, 12, 15]
  const longPeriods = [30, 35, 40, 45, 50, 60]
  return {
    short: shortPeriods.map((period) => alignNumbers(EMA.calculate({ values, period }), values.length)),
    long: longPeriods.map((period) => alignNumbers(EMA.calculate({ values, period }), values.length)),
  }
}

export function detectPatterns(candles: OHLCV[]) {
  const latestCandle = candles.at(-1)
  if (!latestCandle) {
    return {
      doji: false,
      engulfing: 'none',
      hammer: 'none',
    }
  }

  const dojiWindow = candles.slice(-1)
  const engulfingWindow = candles.slice(-2)
  const reversalWindow = candles.slice(-5)
  const contextWindow = candles.slice(-6, -1)

  const dojiPattern =
    dojiWindow.length >= 1
      ? doji({
          open: openSeries(dojiWindow),
          high: highSeries(dojiWindow),
          low: lowSeries(dojiWindow),
          close: closeSeries(dojiWindow),
        })
      : false

  const engulfingPattern =
    engulfingWindow.length >= 2
      ? bullishengulfingpattern({
          open: openSeries(engulfingWindow),
          high: highSeries(engulfingWindow),
          low: lowSeries(engulfingWindow),
          close: closeSeries(engulfingWindow),
        })
        ? 'bullish'
        : bearishengulfingpattern({
            open: openSeries(engulfingWindow),
            high: highSeries(engulfingWindow),
            low: lowSeries(engulfingWindow),
            close: closeSeries(engulfingWindow),
          })
          ? 'bearish'
          : 'none'
      : 'none'

  const body = Math.abs(latestCandle.close - latestCandle.open)
  const range = Math.max(latestCandle.high - latestCandle.low, Number.EPSILON)
  const upperShadow = latestCandle.high - Math.max(latestCandle.open, latestCandle.close)
  const lowerShadow = Math.min(latestCandle.open, latestCandle.close) - latestCandle.low
  const bodyRatio = body / range
  const lowerRatio = lowerShadow / range
  const upperRatio = upperShadow / range
  const priorCloses = contextWindow.map((item) => item.close)
  const priorSlope = priorCloses.length >= 2 ? priorCloses.at(-1)! - priorCloses[0] : 0
  const bullishBody = latestCandle.close >= latestCandle.open
  const bearishBody = latestCandle.close <= latestCandle.open

  const manualHammer =
    priorSlope < 0 &&
    bullishBody &&
    lowerShadow >= Math.max(body * 2.5, range * 0.45) &&
    upperShadow <= Math.max(body * 0.75, range * 0.12) &&
    bodyRatio <= 0.35 &&
    lowerRatio > upperRatio

  const manualShootingStar =
    priorSlope > 0 &&
    bearishBody &&
    upperShadow >= Math.max(body * 2.5, range * 0.45) &&
    lowerShadow <= Math.max(body * 0.75, range * 0.12) &&
    bodyRatio <= 0.35 &&
    upperRatio > lowerRatio

  const hammerPattern =
    reversalWindow.length >= 5
      ? hammerpattern({
          open: openSeries(reversalWindow),
          high: highSeries(reversalWindow),
          low: lowSeries(reversalWindow),
          close: closeSeries(reversalWindow),
        })
        ? 'hammer'
        : shootingstar({
            open: openSeries(reversalWindow),
            high: highSeries(reversalWindow),
            low: lowSeries(reversalWindow),
            close: closeSeries(reversalWindow),
          })
          ? 'shootingStar'
          : manualHammer
            ? 'hammer'
            : manualShootingStar
              ? 'shootingStar'
              : 'none'
      : manualHammer
        ? 'hammer'
        : manualShootingStar
          ? 'shootingStar'
          : 'none'

  return {
    doji: dojiPattern,
    engulfing: engulfingPattern,
    hammer: hammerPattern,
  } as const
}

export function calculateIndicatorSet(candles: OHLCV[]) {
  const close = closeSeries(candles)
  const high = highSeries(candles)
  const low = lowSeries(candles)
  const volume = volumeSeries(candles)
  const typicalPrice = candles.map((item) => (item.high + item.low + item.close) / 3)
  const length = candles.length

  const sma20 = alignNumbers(SMA.calculate({ values: close, period: 20 }), length)
  const sma50 = alignNumbers(SMA.calculate({ values: close, period: 50 }), length)
  const sma100 = alignNumbers(SMA.calculate({ values: close, period: 100 }), length)
  const sma200 = alignNumbers(SMA.calculate({ values: close, period: 200 }), length)
  const ema9 = alignNumbers(EMA.calculate({ values: close, period: 9 }), length)
  const ema21 = alignNumbers(EMA.calculate({ values: close, period: 21 }), length)
  const dema20 = calculateDEMA(close, 20)
  const tema20 = calculateTEMA(close, 20)
  const wma20 = alignNumbers(WMA.calculate({ values: close, period: 20 }), length)
  const hma20 = calculateHMA(close, 20)
  const vwap = alignNumbers(VWAP.calculate({ high, low, close, volume }), length)
  const bollingerRaw = BollingerBands.calculate({ values: close, period: 20, stdDev: 2 })
  const bollinger = Array.from({ length }, (_, index) =>
    index < length - bollingerRaw.length
      ? { upper: null, middle: null, lower: null, pb: null, bandwidth: null }
      : (() => {
          const row = bollingerRaw[index - (length - bollingerRaw.length)]
          const pb = row.upper === row.lower ? null : (close[index] - row.lower) / (row.upper - row.lower)
          const bandwidth = row.middle === 0 ? null : (row.upper - row.lower) / row.middle
          return { upper: row.upper, middle: row.middle, lower: row.lower, pb, bandwidth }
        })(),
  )
  const keltnerRaw = keltnerchannels({
    high,
    low,
    close,
    maPeriod: 20,
    atrPeriod: 10,
    useSMA: false,
    multiplier: 2,
  })
  const keltner = Array.from({ length }, (_, index) =>
    index < length - keltnerRaw.length
      ? { upper: null, middle: null, lower: null }
      : (() => {
          const row = keltnerRaw[index - (length - keltnerRaw.length)]
          return { upper: row.upper, middle: row.middle, lower: row.lower }
        })(),
  )
  const donchian = calculateDonchian(candles)
  const ichimokuRaw = IchimokuCloud.calculate({
    high,
    low,
    conversionPeriod: 9,
    basePeriod: 26,
    spanPeriod: 52,
    displacement: 26,
  })
  const ichimoku = Array.from({ length }, (_, index) =>
    index < length - ichimokuRaw.length
      ? { conversion: null, base: null, spanA: null, spanB: null }
      : (() => {
          const row = ichimokuRaw[index - (length - ichimokuRaw.length)]
          return { conversion: row.conversion, base: row.base, spanA: row.spanA, spanB: row.spanB }
        })(),
  )
  const psar = alignNumbers(PSAR.calculate({ high, low, step: 0.02, max: 0.2 }), length)
  const adxRaw = ADX.calculate({ high, low, close, period: 14 })
  const adx = Array.from({ length }, (_, index) =>
    index < length - adxRaw.length
      ? { adx: null, pdi: null, mdi: null }
      : (() => {
          const row = adxRaw[index - (length - adxRaw.length)]
          return { adx: row.adx, pdi: row.pdi, mdi: row.mdi }
        })(),
  )
  const rsi = alignNumbers(RSI.calculate({ values: close, period: 14 }), length)
  const macdRaw = MACD.calculate({
    values: close,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  })
  const macd = Array.from({ length }, (_, index) =>
    index < length - macdRaw.length
      ? { MACD: null, signal: null, histogram: null }
      : (() => {
          const row = macdRaw[index - (length - macdRaw.length)]
          return { MACD: row.MACD, signal: row.signal, histogram: row.histogram }
        })(),
  )
  const stochRaw = Stochastic.calculate({ high, low, close, period: 14, signalPeriod: 3 })
  const stoch = Array.from({ length }, (_, index) =>
    index < length - stochRaw.length
      ? { k: null, d: null }
      : (() => {
          const row = stochRaw[index - (length - stochRaw.length)]
          return { k: row.k, d: row.d }
        })(),
  )
  const stochRsiRaw = StochasticRSI.calculate({
    values: close,
    rsiPeriod: 14,
    stochasticPeriod: 14,
    kPeriod: 3,
    dPeriod: 3,
  })
  const stochRsi = Array.from({ length }, (_, index) =>
    index < length - stochRsiRaw.length
      ? { k: null, d: null, stochRSI: null }
      : (() => {
          const row = stochRsiRaw[index - (length - stochRsiRaw.length)]
          return { k: row.k, d: row.d, stochRSI: row.stochRSI }
        })(),
  )
  const cci = alignNumbers(CCI.calculate({ high, low, close, period: 20 }), length)
  const williamsR = alignNumbers(WilliamsR.calculate({ high, low, close, period: 14 }), length)
  const roc = alignNumbers(ROC.calculate({ values: close, period: 12 }), length)
  const momentum = calculateMomentum(close, 10)
  const ultimate = calculateUltimateOscillator(candles)
  const atr = alignNumbers(ATR.calculate({ high, low, close, period: 14 }), length)
  const sd20 = alignNumbers(SD.calculate({ values: close, period: 20 }), length)
  const hv20 = calculateHistoricalVolatility(close, 20)
  const obv = alignNumbers(OBV.calculate({ close, volume }), length)
  const cmf = calculateCMF(candles, 21)
  const mfi = alignNumbers(MFI.calculate({ high, low, close, volume, period: 14 }), length)
  const volumeSma20 = calculateVolumeSma(volume, 20)
  const forceIndex = alignNumbers(
    EMA.calculate({
      values: close.map((value, index) => (index === 0 ? 0 : (value - close[index - 1]) * volume[index])),
      period: 13,
    }),
    length,
  )
  const vwma20 = calculateVWMA(candles, 20)
  const pivot = calculatePivotPoints(candles)
  const fibonacci = calculateFibonacci(candles, 100)
  const patterns = detectPatterns(candles)
  const supertrend = calculateSupertrend(candles, 10, 3)
  const aroon = calculateAroonOscillator(candles, 25)
  const cmo = calculateCMO(close, 14)
  const trix = alignNumbers(TRIX.calculate({ values: close, period: 15 }), length)
  const elderRay = calculateElderRay(candles, 13)
  const dpo = calculateDPO(close, 20)
  const guppy = calculateGuppy(close)

  return {
    series: {
      sma20,
      sma50,
      sma100,
      sma200,
      ema9,
      ema21,
      dema20,
      tema20,
      wma20,
      hma20,
      vwap,
      bollinger,
      keltner,
      donchian,
      ichimoku,
      psar,
      adx,
      rsi,
      macd,
      stoch,
      stochRsi,
      cci,
      williamsR,
      roc,
      momentum,
      ultimate,
      atr,
      sd20,
      hv20,
      obv,
      cmf,
      mfi,
      volumeSma20,
      forceIndex,
      vwma20,
      supertrend,
      aroon,
      cmo,
      trix,
      elderRay,
      dpo,
      guppy,
    },
    summaries: {
      sma20: { current: latest(sma20) ?? null },
      sma50: { current: latest(sma50) ?? null },
      sma100: { current: latest(sma100) ?? null },
      sma200: { current: latest(sma200) ?? null },
      ema9: { current: latest(ema9) ?? null },
      ema21: { current: latest(ema21) ?? null },
      dema20: { current: latest(dema20) ?? null },
      tema20: { current: latest(tema20) ?? null },
      wma20: { current: latest(wma20) ?? null },
      hma20: { current: latest(hma20) ?? null },
      vwap: { current: latest(vwap) ?? null },
      bollinger: { current: latest(bollinger)?.pb ?? null, detail: `BW ${formatMaybe(latest(bollinger)?.bandwidth)}` },
      keltner: { current: latest(keltner)?.middle ?? null },
      donchian: { current: latest(donchian)?.middle ?? null },
      ichimoku: { current: latest(ichimoku)?.base ?? null },
      psar: { current: latest(psar) ?? null },
      adx: { current: latest(adx)?.adx ?? null, detail: `+DI ${formatMaybe(latest(adx)?.pdi)} | -DI ${formatMaybe(latest(adx)?.mdi)}` },
      rsi: { current: latest(rsi) ?? null },
      macd: { current: latest(macd)?.MACD ?? null, detail: `Signal ${formatMaybe(latest(macd)?.signal)}` },
      stoch: { current: latest(stoch)?.k ?? null, detail: `%D ${formatMaybe(latest(stoch)?.d)}` },
      stochRsi: { current: latest(stochRsi)?.k ?? null, detail: `%D ${formatMaybe(latest(stochRsi)?.d)}` },
      cci: { current: latest(cci) ?? null },
      williamsR: { current: latest(williamsR) ?? null },
      roc: { current: latest(roc) ?? null },
      momentum: { current: latest(momentum) ?? null },
      ultimate: { current: latest(ultimate) ?? null },
      atr: { current: latest(atr) ?? null },
      sd20: { current: latest(sd20) ?? null },
      hv20: { current: latest(hv20) ?? null },
      obv: { current: latest(obv) ?? null },
      cmf: { current: latest(cmf) ?? null },
      mfi: { current: latest(mfi) ?? null },
      volumeSma20: { current: latest(volumeSma20) ?? null },
      forceIndex: { current: latest(forceIndex) ?? null },
      vwma20: { current: latest(vwma20) ?? null },
      pivot: { current: pivot?.pp ?? null, detail: pivot ? `S1 ${formatMaybe(pivot.s1)} / R1 ${formatMaybe(pivot.r1)}` : undefined },
      fibonacci: { current: fibonacci?.levels['50.0%'] ?? null },
      doji: { current: patterns.doji ? 'Doji' : 'None' },
      engulfing: { current: patterns.engulfing },
      hammer: { current: patterns.hammer },
      supertrend: { current: latest(supertrend)?.trend ?? null },
      aroon: { current: latest(aroon) ?? null },
      cmo: { current: latest(cmo) ?? null },
      trix: { current: latest(trix) ?? null },
      elderRay: { current: latest(elderRay)?.bull ?? null, detail: `Bear ${formatMaybe(latest(elderRay)?.bear)}` },
      dpo: { current: latest(dpo) ?? null },
      guppy: {
        current: mean(guppy.short.map((series) => latest(series) ?? 0)),
        detail: `Long ${formatMaybe(mean(guppy.long.map((series) => latest(series) ?? 0)))}`,
      },
      lastClose: { current: latest(close) ?? null },
      lastVolume: { current: latest(volume) ?? null },
      trendSlope: { current: slopeFromTail(close) },
      typicalPrice: { current: latest(typicalPrice) ?? null },
    },
  }
}
