import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { InsightResult, SupportedTimeframe } from '../types/market'
import { marketById } from '../utils/marketData'
import { useIndicatorStore } from './indicatorStore'
import { useMarketStore } from './marketStore'

const CACHE_TTL = 15 * 60 * 1000

function insightKey(symbol: string, timeframe: SupportedTimeframe) {
  return `${symbol}:${timeframe}`
}

export const useAiStore = defineStore('ai', () => {
  const insights = ref<Record<string, InsightResult>>({})
  const pending = new Map<string, Promise<InsightResult>>()

  async function analyze(symbolId: string, timeframe: SupportedTimeframe, force = false) {
    const marketStore = useMarketStore()
    const indicatorStore = useIndicatorStore()
    const key = insightKey(symbolId, timeframe)
    const cached = insights.value[key]

    if (!force && cached && Date.now() - cached.createdAt < CACHE_TTL) {
      return cached
    }

    const inFlight = pending.get(key)
    if (inFlight) {
      return inFlight
    }

    insights.value[key] = {
      symbol: symbolId,
      timeframe,
      content: '',
      createdAt: Date.now(),
      loading: true,
    }

    const task = (async () => {
      const symbol = marketById(symbolId)
      const quote = marketStore.quotes[symbolId]
      const analysis = (indicatorStore.analysisFor(symbolId, timeframe) ?? (await indicatorStore.ensure(symbolId, timeframe))) as any

      if (!symbol || !quote || !analysis) {
        insights.value[key] = {
          symbol: symbolId,
          timeframe,
          content: '',
          createdAt: Date.now(),
          loading: false,
          error: 'Chua du du lieu de phan tich AI.',
        }
        return insights.value[key]
      }

      const response = await fetch('/api/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: marketStore.settings.openAiModel,
          temperature: 0.2,
          max_tokens: 420,
          stream: true,
          messages: [
            {
              role: 'system',
              content: 'Ban la chuyen gia phan tich tai chinh. Tra loi ngan, ro, uu tien quyet dinh giao dich thuc dung.',
            },
            {
              role: 'user',
              content: `Phan tich nhanh ${symbol.label} (${symbol.id}) khung ${timeframe}.
Gia hien tai: ${quote.price}.
RSI(14): ${analysis.summaries.rsi?.current ?? '--'}.
MACD: ${analysis.summaries.macd?.current ?? '--'}.
ADX: ${analysis.summaries.adx?.current ?? '--'}.
Ket luan xu huong: ${analysis.aggregate.conclusion}.
Tin hieu tong hop: mua ${analysis.aggregate.buy}, ban ${analysis.aggregate.sell}, trung lap ${analysis.aggregate.neutral}.

Tra loi dung 3 phan:
1. Tom tat nhanh market context hom nay cho ${symbol.id} trong 2 cau.
2. Nhan dinh technical chinh trong 3 bullet ngan.
3. Khuyen nghi BUY/SELL/HOLD voi entry, stop loss, take profit.`,
            },
          ],
        }),
      })

      if (!response.ok || !response.body) {
        const errorText = await response.text()
        let errorMessage = `OpenAI request failed (${response.status})`

        try {
          const parsed = JSON.parse(errorText)
          errorMessage = parsed.error?.message ?? parsed.message ?? errorMessage
        } catch {
          if (errorText.trim()) {
            errorMessage = errorText.trim()
          }
        }

        insights.value[key] = {
          symbol: symbolId,
          timeframe,
          content: '',
          createdAt: Date.now(),
          loading: false,
          error: errorMessage,
        }
        return insights.value[key]
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) {
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) {
            continue
          }

          const payload = trimmed.replace(/^data:\s*/, '')
          if (payload === '[DONE]') {
            continue
          }

          try {
            const parsed = JSON.parse(payload)
            const chunk = parsed.choices?.[0]?.delta?.content ?? ''
            insights.value[key] = {
              symbol: symbolId,
              timeframe,
              content: `${insights.value[key]?.content ?? ''}${chunk}`,
              createdAt: Date.now(),
              loading: true,
            }
          } catch {
            continue
          }
        }
      }

      insights.value[key] = {
        ...insights.value[key],
        loading: false,
        createdAt: Date.now(),
      }

      return insights.value[key]
    })()

    pending.set(key, task)
    try {
      return await task
    } finally {
      pending.delete(key)
    }
  }

  return {
    insights,
    analyze,
  }
})
