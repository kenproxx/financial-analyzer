import { INDICATORS } from '../constants/markets'
import type { AggregatedSignal, AnalysisResult, IndicatorSignal, SignalBias } from '../types/market'

function lastNumber(values: unknown) {
  if (!Array.isArray(values)) {
    return null
  }

  const item = values.at(-1)
  return typeof item === 'number' ? item : null
}

function previousNumber(values: unknown) {
  if (!Array.isArray(values)) {
    return null
  }

  const item = values.at(-2)
  return typeof item === 'number' ? item : null
}

function toFixedDisplay(value: unknown) {
  if (typeof value === 'number') {
    return value.toFixed(2)
  }

  if (typeof value === 'string') {
    return value
  }

  return '--'
}

function biasFromThreshold(value: number | null, buyBelow: number, sellAbove: number): SignalBias {
  if (value == null) {
    return 'neutral'
  }

  if (value <= buyBelow) {
    return 'buy'
  }

  if (value >= sellAbove) {
    return 'sell'
  }

  return 'neutral'
}

function aggregateSignals(signals: IndicatorSignal[]): AggregatedSignal {
  const buy = signals.filter((item) => item.bias === 'buy').length
  const sell = signals.filter((item) => item.bias === 'sell').length
  const neutral = signals.filter((item) => item.bias === 'neutral').length
  const total = Math.max(signals.length, 1)
  const buyRatio = buy / total
  const sellRatio = sell / total

  const conclusion =
    buyRatio >= 0.7
      ? 'strongBuy'
      : buyRatio >= 0.55
        ? 'buy'
        : sellRatio >= 0.7
          ? 'strongSell'
          : sellRatio >= 0.55
            ? 'sell'
            : 'neutral'

  return { buy, sell, neutral, total: signals.length, buyRatio, sellRatio, conclusion }
}

export function buildSignals(result: Omit<AnalysisResult, 'signals' | 'aggregate'>, enabled: string[]) {
  const close = Number(result.summaries.lastClose?.current ?? 0)
  const signals = INDICATORS.filter((item) => enabled.includes(item.key)).map((indicator) => {
    const summary = result.summaries[indicator.key]
    let bias: SignalBias = 'neutral'
    let reason = 'Chưa đủ dữ liệu'

    switch (indicator.key) {
      case 'sma20':
      case 'sma50':
      case 'sma100':
      case 'sma200':
      case 'ema9':
      case 'ema21':
      case 'dema20':
      case 'tema20':
      case 'wma20':
      case 'hma20':
      case 'vwap':
      case 'vwma20':
      case 'supertrend':
        if (typeof summary?.current === 'number') {
          bias = close > summary.current ? 'buy' : close < summary.current ? 'sell' : 'neutral'
          reason = close > summary.current ? 'Giá nằm phía trên đường xu hướng' : 'Giá nằm phía dưới đường xu hướng'
        }
        break
      case 'bollinger':
        bias = biasFromThreshold(typeof summary?.current === 'number' ? summary.current : null, 0, 1)
        reason = 'Đánh giá theo %B'
        break
      case 'donchian':
        if (Array.isArray(result.series.donchian)) {
          const latest = result.series.donchian.at(-1) as { upper: number | null; lower: number | null } | undefined
          bias = latest?.upper != null && close > latest.upper ? 'buy' : latest?.lower != null && close < latest.lower ? 'sell' : 'neutral'
          reason = 'Breakout theo Donchian'
        }
        break
      case 'ichimoku':
        if (Array.isArray(result.series.ichimoku)) {
          const latest = result.series.ichimoku.at(-1) as { spanA: number | null; spanB: number | null } | undefined
          const cloudTop = Math.max(latest?.spanA ?? Number.MIN_SAFE_INTEGER, latest?.spanB ?? Number.MIN_SAFE_INTEGER)
          const cloudBottom = Math.min(latest?.spanA ?? Number.MAX_SAFE_INTEGER, latest?.spanB ?? Number.MAX_SAFE_INTEGER)
          bias = close > cloudTop ? 'buy' : close < cloudBottom ? 'sell' : 'neutral'
          reason = 'Vị trí giá so với mây Ichimoku'
        }
        break
      case 'adx':
        if (Array.isArray(result.series.adx)) {
          const latest = result.series.adx.at(-1) as { adx: number | null; pdi: number | null; mdi: number | null } | undefined
          bias =
            (latest?.adx ?? 0) > 25 ? ((latest?.pdi ?? 0) > (latest?.mdi ?? 0) ? 'buy' : 'sell') : 'neutral'
          reason = 'Độ mạnh trend theo ADX'
        }
        break
      case 'rsi':
      case 'mfi':
        bias = biasFromThreshold(typeof summary?.current === 'number' ? summary.current : null, 30, 70)
        reason = 'Vùng overbought/oversold'
        break
      case 'stoch':
      case 'stochRsi':
        bias = biasFromThreshold(typeof summary?.current === 'number' ? summary.current : null, 20, 80)
        reason = 'Dao động ngắn hạn'
        break
      case 'cci':
        bias = biasFromThreshold(typeof summary?.current === 'number' ? summary.current : null, -100, 100)
        reason = 'Ngưỡng CCI'
        break
      case 'williamsR':
        bias = biasFromThreshold(typeof summary?.current === 'number' ? summary.current : null, -80, -20)
        reason = 'Ngưỡng Williams %R'
        break
      case 'roc':
      case 'momentum':
      case 'forceIndex':
      case 'trix':
      case 'dpo':
      case 'aroon':
      case 'cmo':
        if (typeof summary?.current === 'number') {
          bias = summary.current > 0 ? 'buy' : summary.current < 0 ? 'sell' : 'neutral'
          reason = 'Động lượng qua trục 0'
        }
        break
      case 'macd':
        if (Array.isArray(result.series.macd)) {
          const latest = result.series.macd.at(-1) as { MACD: number | null; signal: number | null } | undefined
          const prev = result.series.macd.at(-2) as { MACD: number | null; signal: number | null } | undefined
          bias =
            (latest?.MACD ?? 0) > (latest?.signal ?? 0) && (prev?.MACD ?? 0) <= (prev?.signal ?? 0)
              ? 'buy'
              : (latest?.MACD ?? 0) < (latest?.signal ?? 0) && (prev?.MACD ?? 0) >= (prev?.signal ?? 0)
                ? 'sell'
                : (latest?.MACD ?? 0) > (latest?.signal ?? 0)
                  ? 'buy'
                  : (latest?.MACD ?? 0) < (latest?.signal ?? 0)
                    ? 'sell'
                    : 'neutral'
          reason = 'Giao cắt MACD/Signal'
        }
        break
      case 'ultimate':
        bias = biasFromThreshold(typeof summary?.current === 'number' ? summary.current : null, 30, 70)
        reason = 'Ngưỡng Ultimate Oscillator'
        break
      case 'obv':
        {
          const current = lastNumber(result.series.obv)
          const previous = previousNumber(result.series.obv)
          if (current != null && previous != null) {
            bias = current > previous ? 'buy' : current < previous ? 'sell' : 'neutral'
            reason = 'Dòng tiền OBV'
          }
        }
        break
      case 'cmf':
        if (typeof summary?.current === 'number') {
          bias = summary.current > 0.1 ? 'buy' : summary.current < -0.1 ? 'sell' : 'neutral'
          reason = 'Áp lực mua/bán theo CMF'
        }
        break
      case 'doji':
        bias = summary?.current === 'Doji' ? 'neutral' : 'neutral'
        reason = 'Cảnh báo đảo chiều'
        break
      case 'engulfing':
        bias = summary?.current === 'bullish' ? 'buy' : summary?.current === 'bearish' ? 'sell' : 'neutral'
        reason = 'Mẫu hình engulfing'
        break
      case 'hammer':
        bias = summary?.current === 'hammer' ? 'buy' : summary?.current === 'shootingStar' ? 'sell' : 'neutral'
        reason = 'Mẫu hình nến đảo chiều'
        break
      case 'guppy':
        if (typeof summary?.current === 'number') {
          const longValue = Number(summary.detail?.replace('Long ', '') ?? 0)
          bias = summary.current > longValue ? 'buy' : summary.current < longValue ? 'sell' : 'neutral'
          reason = 'Tương quan EMA ngắn/dài'
        }
        break
      default:
        reason = 'Không có rule chuyên biệt'
    }

    return {
      key: indicator.key,
      label: indicator.label,
      group: indicator.group,
      currentValue: `${toFixedDisplay(summary?.current)}${summary?.detail ? ` · ${summary.detail}` : ''}`,
      bias,
      reason,
    } satisfies IndicatorSignal
  })

  const aggregate = aggregateSignals(signals)
  return { signals, aggregate }
}
