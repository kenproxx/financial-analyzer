<script setup lang="ts">
import { computed } from 'vue'
import AIInsightPanel from './components/AIInsightPanel.vue'
import IndicatorPanel from './components/IndicatorPanel.vue'
import MarketList from './components/MarketList.vue'
import PriceChart from './components/PriceChart.vue'
import SignalPanel from './components/SignalPanel.vue'
import TimeframeSelector from './components/TimeframeSelector.vue'
import { SIGNAL_MATRIX_TIMEFRAMES, TIMEFRAMES } from './constants/markets'
import { useMarketRealtime } from './composables/useMarketRealtime'
import { useAiStore } from './stores/aiStore'
import { useIndicatorStore } from './stores/indicatorStore'
import { useMarketStore } from './stores/marketStore'

const marketStore = useMarketStore()
const indicatorStore = useIndicatorStore()
const aiStore = useAiStore()
const { syncVisibleCharts } = useMarketRealtime()

const currentAnalysis = computed(() => indicatorStore.analysisFor(marketStore.currentSymbolId, marketStore.selectedTimeframe) as any)
const currentInsight = computed(() => aiStore.insights[`${marketStore.currentSymbolId}:${marketStore.selectedTimeframe}`])
const historyLoading = computed(
  () => marketStore.loadingHistory[marketStore.candleKey(marketStore.currentSymbolId, marketStore.selectedTimeframe)],
)

function openMatrixCell(symbolId: string, timeframe: (typeof SIGNAL_MATRIX_TIMEFRAMES)[number]) {
  marketStore.setCurrentSymbol(symbolId)
  marketStore.setTimeframe(timeframe)
}
</script>

<template>
  <div class="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.18),_transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(56,189,248,0.16),_transparent_20%),linear-gradient(180deg,_#020617_0%,_#020617_48%,_#0f172a_100%)] text-slate-100">
    <div class="mx-auto max-w-[1800px] px-4 py-6 lg:px-6">
      <header class="mb-6 flex flex-wrap items-start justify-between gap-4 rounded-[2rem] border border-slate-800 bg-slate-950/60 p-5 shadow-2xl shadow-slate-950/40 backdrop-blur">
        <div>
          <p class="text-xs uppercase tracking-[0.4em] text-emerald-300/70">Financial Analyzer</p>
          <h1 class="font-display text-3xl text-slate-50 lg:text-4xl">Bảng điều khiển phân tích kỹ thuật thời gian thực cho crypto, forex, vàng, chỉ số và cổ phiếu Việt Nam</h1>
          <p class="mt-2 max-w-4xl text-sm text-slate-400">
            Theo dõi giá trực tiếp, tự động chuyển nguồn dữ liệu dự phòng, phân tích kỹ thuật bằng Web Worker, ma trận tín hiệu đa khung thời gian và nhận định thị trường bằng AI.
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button class="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-200" @click="marketStore.toggleTheme()">
            {{ marketStore.settings.theme === 'dark' ? 'Chế độ sáng' : 'Chế độ tối' }}
          </button>
          <button
            v-for="count in [1, 2, 4]"
            :key="count"
            class="rounded-full border px-4 py-2 text-sm"
            :class="
              marketStore.settings.multiChartCount === count
                ? 'border-emerald-400 bg-emerald-500/10 text-emerald-200'
                : 'border-slate-700 text-slate-300'
            "
            @click="marketStore.setMultiChartCount(count as 1 | 2 | 4)"
          >
            {{ count }} biểu đồ
          </button>
        </div>
      </header>

      <div class="grid gap-6 xl:grid-cols-[360px,minmax(0,1fr),400px]">
        <div class="min-w-0 space-y-6">
          <MarketList
            :watchlist-ids="marketStore.watchlistIds"
            :current-symbol-id="marketStore.currentSymbolId"
            :quotes="marketStore.quotes"
            @select="marketStore.setCurrentSymbol"
            @toggle-watchlist="marketStore.toggleWatchlist"
            @add-alert="marketStore.addAlert"
          />
        </div>

        <main class="min-w-0 space-y-6">
          <section class="rounded-[2rem] border border-slate-800 bg-slate-950/60 p-4 shadow-2xl shadow-slate-950/30">
            <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p class="text-xs uppercase tracking-[0.3em] text-slate-500">Khung thời gian</p>
                <h2 class="font-display text-lg text-slate-100">Chọn khung giao dịch</h2>
              </div>
              <button class="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-200" @click="syncVisibleCharts(true)">
                Tải lại dữ liệu lịch sử
              </button>
            </div>
            <TimeframeSelector v-model="marketStore.selectedTimeframe" :options="TIMEFRAMES" />
          </section>

          <div
            class="min-w-0 grid gap-6"
            :class="
              marketStore.settings.multiChartCount === 1
                ? 'grid-cols-1'
                : marketStore.settings.multiChartCount === 2
                  ? 'grid-cols-1 2xl:grid-cols-2'
                  : 'grid-cols-1 2xl:grid-cols-2'
            "
          >
            <PriceChart
              v-for="chartSymbol in marketStore.chartSymbols"
              :key="`${chartSymbol.id}:${marketStore.selectedTimeframe}`"
              class="min-w-0"
              :symbol="chartSymbol"
              :timeframe="marketStore.selectedTimeframe"
              :candles="marketStore.candlesFor(chartSymbol.id, marketStore.selectedTimeframe)"
              :analysis="indicatorStore.analysisFor(chartSymbol.id, marketStore.selectedTimeframe) as any"
              :enabled-indicators="indicatorStore.activeIndicators.map((item) => item.key)"
              :loading="historyLoading && chartSymbol.id === marketStore.currentSymbolId"
            />
          </div>

          <AIInsightPanel
            class="min-w-0"
            :symbol="marketStore.currentSymbol"
            :timeframe="marketStore.selectedTimeframe"
            :insight="currentInsight"
            @analyze="(force) => aiStore.analyze(marketStore.currentSymbolId, marketStore.selectedTimeframe, force)"
          />

          <SignalPanel
            class="min-w-0"
            :analysis="currentAnalysis"
            :watchlist="marketStore.watchlist"
            :matrix="indicatorStore.timeframeMatrix"
            :timeframes="SIGNAL_MATRIX_TIMEFRAMES"
            @open-cell="openMatrixCell"
          />
        </main>

        <div class="min-w-0 space-y-6">
          <IndicatorPanel
            class="min-w-0"
            :enabled-indicators="indicatorStore.enabledIndicators"
            :enabled-groups="indicatorStore.enabledGroups"
            @toggle-indicator="indicatorStore.toggleIndicator"
            @toggle-group="indicatorStore.toggleGroup"
            @toggle-all="indicatorStore.setAllIndicators"
            @preset="indicatorStore.applyPreset"
          />
        </div>
      </div>
    </div>
  </div>
</template>
