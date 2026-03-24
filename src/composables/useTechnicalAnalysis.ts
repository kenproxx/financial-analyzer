import type { AnalysisResult, OHLCV, SupportedTimeframe } from '../types/market'
import { uid } from '../utils/storage'

type WorkerResult = Omit<AnalysisResult, 'signals' | 'aggregate'>

interface PendingTask {
  resolve: (value: WorkerResult) => void
  reject: (reason?: unknown) => void
}

const worker = new Worker(new URL('../workers/indicatorWorker.ts', import.meta.url), { type: 'module' })
const pending = new Map<string, PendingTask>()

worker.onmessage = (event: MessageEvent<{ id: string; ok: boolean; result?: WorkerResult; error?: string }>) => {
  const task = pending.get(event.data.id)
  if (!task) {
    return
  }

  pending.delete(event.data.id)
  if (event.data.ok && event.data.result) {
    task.resolve(event.data.result)
    return
  }

  task.reject(new Error(event.data.error ?? 'Worker error'))
}

export function useTechnicalAnalysis() {
  async function calculate(symbol: string, timeframe: SupportedTimeframe, candles: OHLCV[], lastClosedTime?: number) {
    return new Promise<WorkerResult>((resolve, reject) => {
      const id = uid('worker')
      pending.set(id, { resolve, reject })
      worker.postMessage({
        id,
        symbol,
        timeframe,
        candles,
        lastClosedTime,
      })
    })
  }

  return { calculate }
}
