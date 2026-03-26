import type { OHLCV, SupportedTimeframe } from '../types/market'
import { calculateIndicatorSet } from '../utils/indicators'

interface IndicatorWorkerRequest {
  id: string
  symbol: string
  timeframe: SupportedTimeframe
  candles: OHLCV[]
  lastClosedTime?: number
}

self.onmessage = (event: MessageEvent<IndicatorWorkerRequest>) => {
  const payload = event.data

  try {
    const result = calculateIndicatorSet(payload.candles)
    self.postMessage({
      id: payload.id,
      ok: true,
      result: {
        symbol: payload.symbol,
        timeframe: payload.timeframe,
        computedAt: Date.now(),
        lastClosedTime: payload.lastClosedTime,
        series: result.series,
        summaries: result.summaries,
      },
    })
  } catch (error) {
    self.postMessage({
      id: payload.id,
      ok: false,
      error: error instanceof Error ? error.message : 'Worker tính chỉ báo thất bại',
    })
  }
}
