<script setup lang="ts">
import { computed } from 'vue'
import type { SignalStrength, SupportedTimeframe, TimeframeSignalCell } from '../types/market'
import { formatPercent, signalGlyph, signalLabel } from '../utils/format'

const props = defineProps<{
  analysis?: {
    signals: Array<{
      key: string
      label: string
      currentValue: string
      bias: 'buy' | 'sell' | 'neutral'
    }>
    aggregate: {
      buy: number
      sell: number
      neutral: number
      total: number
      buyRatio: number
      sellRatio: number
      conclusion: SignalStrength
    }
  } | null
  watchlist: Array<{ id: string }>
  matrix: Record<string, TimeframeSignalCell>
  timeframes: SupportedTimeframe[]
}>()

const emit = defineEmits<{
  openCell: [symbolId: string, timeframe: SupportedTimeframe]
}>()

const buyWidth = computed(() => `${(props.analysis?.aggregate.buyRatio ?? 0) * 100}%`)
const sellWidth = computed(() => `${(props.analysis?.aggregate.sellRatio ?? 0) * 100}%`)
</script>

<template>
  <section class="rounded-3xl border border-slate-800 bg-slate-950/70 p-4 shadow-2xl shadow-slate-950/30">
    <div class="mb-4">
      <p class="text-xs uppercase tracking-[0.3em] text-slate-500">Tín hiệu giao dịch</p>
      <h2 class="font-display text-lg text-slate-100">Bảng tín hiệu mua bán</h2>
    </div>

    <div class="mb-4 overflow-hidden rounded-2xl border border-slate-800">
      <div class="grid grid-cols-[1.3fr,1fr,110px] gap-3 bg-slate-900/80 px-3 py-2 text-xs uppercase tracking-[0.2em] text-slate-500">
        <span>Chỉ báo</span>
        <span>Giá trị</span>
        <span>Tín hiệu</span>
      </div>
      <div v-if="analysis?.signals?.length" class="max-h-72 overflow-auto">
        <div
          v-for="signal in analysis.signals"
          :key="signal.key"
          class="grid grid-cols-[1.3fr,1fr,110px] gap-3 border-t border-slate-800 px-3 py-2 text-sm"
        >
          <span class="text-slate-100">{{ signal.label }}</span>
          <span class="text-slate-400">{{ signal.currentValue }}</span>
          <span
            class="rounded-full px-2 py-1 text-center text-xs font-semibold"
            :class="
              signal.bias === 'buy'
                ? 'bg-emerald-500/20 text-emerald-200'
                : signal.bias === 'sell'
                  ? 'bg-rose-500/20 text-rose-200'
                  : 'bg-slate-800 text-slate-300'
            "
          >
            {{ signal.bias === 'buy' ? 'MUA' : signal.bias === 'sell' ? 'BÁN' : 'TRUNG LẬP' }}
          </span>
        </div>
      </div>
      <div v-else class="px-3 py-8 text-center text-sm text-slate-500">Chưa có phân tích cho khung thời gian hiện tại.</div>
    </div>

    <div v-if="analysis" class="mb-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div class="mb-3 flex items-center justify-between">
        <p class="text-sm font-semibold text-slate-100">{{ signalLabel(analysis.aggregate.conclusion) }}</p>
        <p class="text-xs text-slate-400">
          Mua {{ analysis.aggregate.buy }} / Bán {{ analysis.aggregate.sell }} / Trung lập {{ analysis.aggregate.neutral }}
        </p>
      </div>
      <div class="h-3 overflow-hidden rounded-full bg-slate-800">
        <div class="h-full bg-emerald-500" :style="{ width: buyWidth }" />
      </div>
      <div class="mt-2 h-3 overflow-hidden rounded-full bg-slate-800">
        <div class="h-full bg-rose-500" :style="{ width: sellWidth }" />
      </div>
      <div class="mt-3 flex justify-between text-xs text-slate-500">
        <span>Tỷ lệ mua {{ formatPercent((analysis.aggregate.buyRatio ?? 0) * 100) }}</span>
        <span>Tỷ lệ bán {{ formatPercent((analysis.aggregate.sellRatio ?? 0) * 100) }}</span>
      </div>
    </div>

    <div>
      <div class="mb-3">
        <p class="text-xs uppercase tracking-[0.3em] text-slate-500">Đa khung thời gian</p>
        <h3 class="font-display text-base text-slate-100">Ma trận tín hiệu</h3>
      </div>

      <div class="overflow-auto rounded-2xl border border-slate-800">
        <table class="min-w-full text-sm">
          <thead class="bg-slate-900/80 text-xs uppercase tracking-[0.2em] text-slate-500">
            <tr>
              <th class="px-3 py-2 text-left">Tài sản</th>
              <th v-for="timeframe in timeframes" :key="timeframe" class="px-3 py-2 text-center">{{ timeframe }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in watchlist" :key="row.id" class="border-t border-slate-800">
              <td class="px-3 py-2 font-medium text-slate-100">{{ row.id }}</td>
              <td v-for="timeframe in timeframes" :key="`${row.id}:${timeframe}`" class="px-2 py-2 text-center">
                <button
                  v-if="!matrix[`${row.id}:${timeframe}`]?.loading && !matrix[`${row.id}:${timeframe}`]?.hasData"
                  class="min-w-[46px] rounded-xl bg-slate-900 px-2 py-1 text-xs font-semibold text-slate-500"
                  :title="matrix[`${row.id}:${timeframe}`]?.error || 'Chưa có dữ liệu'"
                  @click="emit('openCell', row.id, timeframe)"
                >
                  N/A
                </button>
                <button
                  v-else
                  class="min-w-[46px] rounded-xl px-2 py-1 text-xs font-semibold"
                  :class="
                    matrix[`${row.id}:${timeframe}`]?.loading
                      ? 'bg-slate-800 text-slate-500'
                      : matrix[`${row.id}:${timeframe}`]?.strength === 'strongBuy'
                        ? 'bg-emerald-500/25 text-emerald-100'
                        : matrix[`${row.id}:${timeframe}`]?.strength === 'buy'
                          ? 'bg-emerald-500/10 text-emerald-200'
                          : matrix[`${row.id}:${timeframe}`]?.strength === 'sell'
                            ? 'bg-rose-500/10 text-rose-200'
                            : matrix[`${row.id}:${timeframe}`]?.strength === 'strongSell'
                              ? 'bg-rose-500/25 text-rose-100'
                              : 'bg-slate-800 text-slate-300'
                  "
                  :title="
                    matrix[`${row.id}:${timeframe}`]?.loading
                      ? 'Đang tính tín hiệu'
                      : signalLabel(matrix[`${row.id}:${timeframe}`]?.strength ?? 'neutral')
                  "
                  @click="emit('openCell', row.id, timeframe)"
                >
                  {{
                    matrix[`${row.id}:${timeframe}`]?.loading
                      ? '...'
                      : matrix[`${row.id}:${timeframe}`]?.strength === 'neutral'
                        ? '•'
                        : signalGlyph(matrix[`${row.id}:${timeframe}`]?.strength ?? 'neutral')
                  }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
