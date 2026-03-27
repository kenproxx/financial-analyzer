import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { InsightResult, SupportedTimeframe } from '../types/market'
import { marketById } from '../utils/marketData'
import { useIndicatorStore } from './indicatorStore'
import { useMarketStore } from './marketStore'

const CACHE_TTL = 15 * 60 * 1000
const RATE_LIMIT_COOLDOWN_MS = 60 * 1000
const QUOTA_COOLDOWN_MS = 30 * 60 * 1000

export function insightKey(symbol: string, timeframe: SupportedTimeframe) {
  return `${symbol}:${timeframe}`
}

export function parseRetryAfter(value: string | null) {
  if (!value) {
    return null
  }

  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds > 0) {
    return Date.now() + seconds * 1000
  }

  const asDate = new Date(value).getTime()
  return Number.isFinite(asDate) ? asDate : null
}

function formatRetryTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const useAiStore = defineStore('ai', () => {
  const insights = ref<Record<string, InsightResult>>({})
  const pending = new Map<string, Promise<InsightResult>>()
  const blockedUntil = ref(0)
  const blockedMessage = ref('')

  async function analyze(symbolId: string, timeframe: SupportedTimeframe, force = false) {
    const marketStore = useMarketStore()
    const indicatorStore = useIndicatorStore()
    const key = insightKey(symbolId, timeframe)
    const cached = insights.value[key]

    if (Date.now() < blockedUntil.value) {
      insights.value[key] = {
        symbol: symbolId,
        timeframe,
        content: '',
        createdAt: Date.now(),
        loading: false,
        error: blockedMessage.value,
        errorCode: 'cooldown_active',
        statusCode: 429,
        retryAt: blockedUntil.value,
      }
      return insights.value[key]
    }

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
          error: 'Chưa đủ dữ liệu để phân tích AI.',
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
              content: 'Bạn là chuyên gia phân tích tài chính. Trả lời ngắn, rõ và ưu tiên khuyến nghị giao dịch thực dụng.',
            },
            {
              role: 'user',
              content: `Phân tích nhanh ${symbol.label} (${symbol.id}) trên khung ${timeframe}.
Giá hiện tại: ${quote.price}.
RSI(14): ${analysis.summaries.rsi?.current ?? '--'}.
MACD: ${analysis.summaries.macd?.current ?? '--'}.
ADX: ${analysis.summaries.adx?.current ?? '--'}.
Kết luận xu hướng: ${analysis.aggregate.conclusion}.
Tín hiệu tổng hợp: mua ${analysis.aggregate.buy}, bán ${analysis.aggregate.sell}, trung lập ${analysis.aggregate.neutral}.

Trả lời đúng 3 phần:
1. Tóm tắt nhanh bối cảnh thị trường hôm nay cho ${symbol.id} trong 2 câu.
2. Nhận định kỹ thuật chính trong 3 gạch đầu dòng ngắn.
3. Khuyến nghị BUY/SELL/HOLD với entry, stop loss, take profit.`,
            },
          ],
        }),
      })

      if (!response.ok || !response.body) {
        const errorText = await response.text()
        let errorMessage = `Yêu cầu OpenAI thất bại (${response.status})`
        let errorCode = ''

        try {
          const parsed = JSON.parse(errorText)
          errorMessage = parsed.error?.message ?? parsed.message ?? errorMessage
          errorCode = parsed.error?.code ?? parsed.code ?? ''
        } catch {
          if (errorText.trim()) {
            errorMessage = errorText.trim()
          }
        }

        let retryAt: number | undefined
        if (response.status === 429) {
          if (errorCode === 'insufficient_quota') {
            retryAt = Date.now() + QUOTA_COOLDOWN_MS
            errorMessage = `API key OpenAI đã hết quota. Tạm khóa AI đến ${formatRetryTime(retryAt)} để tránh gọi lặp.`
          } else {
            retryAt = parseRetryAfter(response.headers.get('retry-after')) ?? Date.now() + RATE_LIMIT_COOLDOWN_MS
            errorMessage = `OpenAI đang giới hạn tần suất. Vui lòng thử lại sau ${formatRetryTime(retryAt)}.`
          }

          blockedUntil.value = retryAt
          blockedMessage.value = errorMessage
        } else if (response.status < 429) {
          blockedUntil.value = 0
          blockedMessage.value = ''
        }

        insights.value[key] = {
          symbol: symbolId,
          timeframe,
          content: '',
          createdAt: Date.now(),
          loading: false,
          error: errorMessage,
          errorCode,
          statusCode: response.status,
          retryAt,
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
      blockedUntil.value = 0
      blockedMessage.value = ''

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
    blockedUntil,
    blockedMessage,
    analyze,
  }
})
