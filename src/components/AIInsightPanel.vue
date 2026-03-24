<script setup lang="ts">
import type { InsightResult, MarketSymbol, SupportedTimeframe } from '../types/market'

defineProps<{
  symbol: MarketSymbol
  timeframe: SupportedTimeframe
  insight?: InsightResult
}>()

const emit = defineEmits<{
  analyze: [force: boolean]
}>()
</script>

<template>
  <section class="rounded-3xl border border-slate-800 bg-slate-950/70 p-4 shadow-2xl shadow-slate-950/30">
    <div class="mb-4 flex items-start justify-between gap-3">
      <div>
        <p class="text-xs uppercase tracking-[0.3em] text-slate-500">AI Insight</p>
        <h2 class="font-display text-lg text-slate-100">Phân tích thị trường bằng AI</h2>
        <p class="mt-1 text-sm text-slate-500">{{ symbol.id }} · {{ timeframe }}</p>
      </div>
      <div class="flex gap-2">
        <button class="rounded-full border border-emerald-400/50 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200" @click="emit('analyze', false)">
          Phân tích AI
        </button>
        <button class="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-200" @click="emit('analyze', true)">
          Refresh
        </button>
      </div>
    </div>

    <div class="min-h-48 rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
      <p v-if="insight?.error" class="text-sm text-rose-300">{{ insight.error }}</p>
      <div v-else-if="insight?.content" class="space-y-3 whitespace-pre-wrap text-sm leading-7 text-slate-200">
        {{ insight.content }}
        <span v-if="insight.loading" class="animate-pulse text-emerald-300">▍</span>
      </div>
      <p v-else class="text-sm text-slate-500">
        Nhấn "Phân tích AI" để stream nhận định technical + macro và khuyến nghị entry / stop loss / take profit.
      </p>
    </div>
  </section>
</template>
