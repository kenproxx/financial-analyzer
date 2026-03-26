<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { InsightResult, MarketSymbol, SupportedTimeframe } from '../types/market'

const props = defineProps<{
  symbol: MarketSymbol
  timeframe: SupportedTimeframe
  insight?: InsightResult
}>()

const emit = defineEmits<{
  analyze: [force: boolean]
}>()

const now = ref(Date.now())
let timer: number | null = null

const isCoolingDown = computed(() => Boolean(props.insight?.retryAt && props.insight.retryAt > now.value))
const canAnalyze = computed(() => !props.insight?.loading && !isCoolingDown.value)
const retryLabel = computed(() =>
  props.insight?.retryAt
    ? new Date(props.insight.retryAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '',
)

onMounted(() => {
  timer = window.setInterval(() => {
    now.value = Date.now()
  }, 1000)
})

onBeforeUnmount(() => {
  if (timer != null) {
    window.clearInterval(timer)
  }
})
</script>

<template>
  <section class="rounded-3xl border border-slate-800 bg-slate-950/70 p-4 shadow-2xl shadow-slate-950/30">
    <div class="mb-4 flex items-start justify-between gap-3">
      <div>
        <p class="text-xs uppercase tracking-[0.3em] text-slate-500">Nhận định AI</p>
        <h2 class="font-display text-lg text-slate-100">Phân tích thị trường bằng AI</h2>
        <p class="mt-1 text-sm text-slate-500">{{ symbol.id }} · {{ timeframe }}</p>
        <p v-if="isCoolingDown" class="mt-1 text-xs text-amber-300">AI tạm khóa đến {{ retryLabel }}</p>
      </div>
      <div class="flex gap-2">
        <button
          class="rounded-full border border-emerald-400/50 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-900 disabled:text-slate-500"
          :disabled="!canAnalyze"
          @click="emit('analyze', false)"
        >
          Phân tích AI
        </button>
        <button
          class="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-200 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
          :disabled="!canAnalyze"
          @click="emit('analyze', true)"
        >
          Làm mới
        </button>
      </div>
    </div>

    <div class="min-h-48 rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
      <div v-if="insight?.error" class="space-y-2">
        <p class="text-sm" :class="insight.statusCode === 429 ? 'text-amber-300' : 'text-rose-300'">
          {{ insight.error }}
        </p>
        <p v-if="insight.errorCode === 'insufficient_quota'" class="text-xs text-slate-500">
          Có thể nạp thêm quota hoặc đổi sang API key khác trên Vercel.
        </p>
      </div>
      <div v-else-if="insight?.content" class="space-y-3 whitespace-pre-wrap text-sm leading-7 text-slate-200">
        {{ insight.content }}
        <span v-if="insight.loading" class="animate-pulse text-emerald-300">|</span>
      </div>
      <p v-else class="text-sm text-slate-500">
        Nhấn "Phân tích AI" để stream nhận định kỹ thuật, bối cảnh thị trường và gợi ý điểm vào lệnh, cắt lỗ, chốt lời.
      </p>
    </div>
  </section>
</template>
