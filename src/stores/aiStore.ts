import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { InsightResult, SupportedTimeframe } from '../types/market'
import { useIndicatorStore } from './indicatorStore'
import { useMarketStore } from './marketStore'

const CACHE_TTL = 15 * 60 * 1000

function insightKey(symbol: string, timeframe: SupportedTimeframe) {
  return `${symbol}:${timeframe}`
}

export const useAiStore = defineStore('ai', () => {
  const insights = ref<Record<string, InsightResult>>({})

  async function analyze(symbolId: string, timeframe: SupportedTimeframe, force = false) {
    const marketStore = useMarketStore()
    const indicatorStore = useIndicatorStore()
    const key = insightKey(symbolId, timeframe)
    const cached = insights.value[key]

    if (!force && cached && Date.now() - cached.createdAt < CACHE_TTL) {
      return cached
    }

    if (!marketStore.settings.openAiKey) {
      insights.value[key] = {
        symbol: symbolId,
        timeframe,
        content: '',
        createdAt: Date.now(),
        loading: false,
        error: 'Thiếu OpenAI API key trong Settings.',
      }
      return insights.value[key]
    }

    const symbol = marketStore.currentSymbol.id === symbolId ? marketStore.currentSymbol : marketStore.watchlist.find((item) => item.id === symbolId)
    const quote = marketStore.quotes[symbolId]
    const analysis = (await indicatorStore.ensure(symbolId, timeframe)) as any

    if (!symbol || !quote || !analysis) {
      insights.value[key] = {
        symbol: symbolId,
        timeframe,
        content: '',
        createdAt: Date.now(),
        loading: false,
        error: 'Chưa đủ dữ liệu để phân tích AI.',
      }
      return insights.value[key]
    }

    insights.value[key] = {
      symbol: symbolId,
      timeframe,
      content: '',
      createdAt: Date.now(),
      loading: true,
    }

    const response = await fetch('/api/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${marketStore.settings.openAiKey}`,
      },
      body: JSON.stringify({
        model: marketStore.settings.openAiModel,
        temperature: 0.3,
        stream: true,
        messages: [
          {
            role: 'system',
            content: 'Bạn là chuyên gia phân tích tài chính. Hãy phân tích dựa trên dữ liệu kỹ thuật và tình hình thị trường.',
          },
          {
            role: 'user',
            content: `Tài sản: ${symbol.label} (${symbol.id}). Giá hiện tại: ${quote.price}.
RSI(14): ${analysis.summaries.rsi?.current ?? '--'}.
MACD: ${analysis.summaries.macd?.current ?? '--'}.
ADX: ${analysis.summaries.adx?.current ?? '--'}.
Trend: ${analysis.aggregate.conclusion}.
Tín hiệu kỹ thuật tổng hợp: MUA ${analysis.aggregate.buy}, BÁN ${analysis.aggregate.sell}, TRUNG LẬP ${analysis.aggregate.neutral}.
Hãy:
1) Tóm tắt tình hình thị trường toàn cầu ảnh hưởng đến ${symbol.id} hôm nay.
2) Phân tích thêm dựa trên technical + macro.
3) Khuyến nghị MUA/BÁN/HOLD với mức giá entry, stop loss, take profit.`,
          },
        ],
      }),
    })

    if (!response.ok || !response.body) {
      insights.value[key] = {
        symbol: symbolId,
        timeframe,
        content: '',
        createdAt: Date.now(),
        loading: false,
        error: `OpenAI request failed (${response.status})`,
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
  }

  return {
    insights,
    analyze,
  }
})
