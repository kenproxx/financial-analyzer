<script setup lang="ts">
import { computed, ref } from 'vue'
import { MARKETS } from '../constants/markets'
import type { PriceSnapshot } from '../types/market'
import { formatPercent, formatPrice } from '../utils/format'

const props = defineProps<{
  watchlistIds: string[]
  currentSymbolId: string
  quotes: Record<string, PriceSnapshot>
}>()

const emit = defineEmits<{
  select: [symbolId: string]
  toggleWatchlist: [symbolId: string]
  addAlert: [symbolId: string, target: number, direction: 'above' | 'below']
}>()

const query = ref('')

const watchlistMarkets = computed(() =>
  props.watchlistIds
    .map((id) => MARKETS.find((item) => item.id === id))
    .filter((item): item is (typeof MARKETS)[number] => Boolean(item)),
)

const filteredMarkets = computed(() => {
  const normalizedQuery = query.value.trim().toLowerCase()
  if (!normalizedQuery) {
    return watchlistMarkets.value
  }

  return MARKETS.filter(
    (item) =>
      item.id.toLowerCase().includes(normalizedQuery) ||
      item.label.toLowerCase().includes(normalizedQuery),
  )
})

function quickAlert(symbolId: string, price: number) {
  emit('addAlert', symbolId, price, 'above')
}
</script>

<template>
  <section class="rounded-3xl border border-slate-800 bg-slate-950/70 p-4 shadow-2xl shadow-slate-950/30 backdrop-blur">
    <div class="mb-4 flex items-center justify-between gap-3">
      <div>
        <p class="text-xs uppercase tracking-[0.3em] text-slate-500">Danh mục theo dõi</p>
        <h2 class="font-display text-lg text-slate-100">Tài sản đang theo dõi</h2>
      </div>
      <span class="rounded-full bg-slate-900 px-3 py-1 text-xs text-slate-400">{{ watchlistIds.length }} tài sản</span>
    </div>

    <input
      v-model="query"
      class="mb-4 w-full rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-emerald-400"
      placeholder="Tìm BTC, VCB, vàng..."
      type="text"
    />

    <div class="grid max-h-[32rem] gap-2 overflow-auto pr-1">
      <div
        v-for="market in filteredMarkets"
        :key="market.id"
        class="grid grid-cols-[auto,1fr,auto] items-center gap-3 rounded-2xl border px-3 py-3 text-left transition"
        :class="
          market.id === currentSymbolId
            ? 'border-emerald-400/60 bg-emerald-500/10'
            : 'border-slate-800 bg-slate-900/40 hover:border-slate-600'
        "
      >
        <button
          class="h-8 w-8 rounded-full border text-xs"
          :class="
            watchlistIds.includes(market.id)
              ? 'border-amber-400 bg-amber-400/15 text-amber-300'
              : 'border-slate-700 text-slate-500'
          "
          @click.stop="emit('toggleWatchlist', market.id)"
        >
          ★
        </button>

        <div class="min-w-0">
          <button class="block w-full text-left" @click="emit('select', market.id)">
            <p class="truncate text-sm font-semibold text-slate-100">{{ market.id }}</p>
            <p class="truncate text-xs text-slate-500">{{ market.label }}</p>
          </button>
        </div>

        <div class="text-right">
          <p class="text-sm font-semibold text-slate-100">
            {{ formatPrice(quotes[market.id]?.price, market.precision) }}
          </p>
          <p
            class="text-xs"
            :class="(quotes[market.id]?.changePercent ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'"
          >
            {{ formatPercent(quotes[market.id]?.changePercent) }}
          </p>
          <button
            v-if="quotes[market.id]?.price"
            class="mt-1 text-[11px] text-slate-500 hover:text-slate-300"
            @click.stop="quickAlert(market.id, quotes[market.id].price)"
          >
            Cảnh báo giá
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
