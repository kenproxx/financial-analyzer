<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AIInsightPanel from './components/AIInsightPanel.vue'
import IndicatorPanel from './components/IndicatorPanel.vue'
import MarketList from './components/MarketList.vue'
import PriceChart from './components/PriceChart.vue'
import SignalPanel from './components/SignalPanel.vue'
import TimeframeSelector from './components/TimeframeSelector.vue'
import { SIGNAL_MATRIX_TIMEFRAMES, TIMEFRAMES } from './constants/markets'
import { useWebSocket } from './composables/useWebSocket'
import { useAiStore } from './stores/aiStore'
import { useIndicatorStore } from './stores/indicatorStore'
import { useMarketStore } from './stores/marketStore'
import type { SupportedTimeframe } from './types/market'
import { convertBinanceKline, marketByBinanceSymbol, parseFinnhubQuote, timeframeConfig } from './utils/marketData'

const marketStore = useMarketStore()
const indicatorStore = useIndicatorStore()
const aiStore = useAiStore()

const activeBinanceSymbolId = ref<string | null>(null)
const activeBinanceTimeframe = ref<SupportedTimeframe | null>(null)
const activeBinanceInterval = ref<string | null>(null)
let historyRefreshTimer: number | null = null
let matrixRefreshTimer: number | null = null

const currentAnalysis = computed(() => indicatorStore.analysisFor(marketStore.currentSymbolId, marketStore.selectedTimeframe) as any)
const currentInsight = computed(() => aiStore.insights[`${marketStore.currentSymbolId}:${marketStore.selectedTimeframe}`])
const historyLoading = computed(
  () => marketStore.loadingHistory[marketStore.candleKey(marketStore.currentSymbolId, marketStore.selectedTimeframe)],
)

function maybeAnalyzeCurrentView() {
  // Keep AI analysis user-triggered to avoid burning quota from background refreshes.
  return
}

const binanceSocket = useWebSocket({
  url: () => {
    const symbol = marketStore.currentSymbol
    if (symbol.category !== 'crypto' || !symbol.binanceSymbol) {
      activeBinanceSymbolId.value = null
      activeBinanceTimeframe.value = null
      activeBinanceInterval.value = null
      return null
    }

    const timeframe = marketStore.selectedTimeframe
    const interval = timeframeConfig(timeframe).binanceInterval
    activeBinanceSymbolId.value = symbol.id
    activeBinanceTimeframe.value = timeframe
    activeBinanceInterval.value = interval
    return `wss://stream.binance.com:9443/ws/${symbol.binanceSymbol}@kline_${interval}`
  },
  autoReconnect: true,
  onMessage: (event) => {
    const payload = JSON.parse(event.data) as Record<string, unknown>
    const payloadSymbol = String(payload.s ?? (payload.k as Record<string, unknown> | undefined)?.s ?? '')
    const payloadInterval = String((payload.k as Record<string, unknown> | undefined)?.i ?? '')
    const streamSymbolId = marketByBinanceSymbol(payloadSymbol)?.id ?? activeBinanceSymbolId.value
    const streamTimeframe = activeBinanceTimeframe.value
    const candle = convertBinanceKline(payload)
    if (
      !candle ||
      !streamSymbolId ||
      !streamTimeframe ||
      (activeBinanceSymbolId.value && streamSymbolId !== activeBinanceSymbolId.value) ||
      (activeBinanceInterval.value && payloadInterval && payloadInterval !== activeBinanceInterval.value)
    ) {
      return
    }

    const isClosed = Boolean((payload.k as Record<string, unknown> | undefined)?.x)
    marketStore.upsertRealtimeCandle(streamSymbolId, streamTimeframe, candle, isClosed)
    marketStore.upsertQuote({
      symbol: streamSymbolId,
      price: candle.close,
      changePercent: marketStore.quotes[streamSymbolId]?.changePercent ?? 0,
      source: 'binance',
      timestamp: candle.time,
      volume: candle.volume,
    })
    if (isClosed) {
      void indicatorStore.compute(streamSymbolId, streamTimeframe, true)
    }
  },
})

const finnhubSocket = useWebSocket({
  url: () => (marketStore.settings.finnhubKey ? `wss://ws.finnhub.io?token=${marketStore.settings.finnhubKey}` : null),
  autoReconnect: true,
  onOpen: (socket) => {
    marketStore.watchlist
      .filter((item) => item.finnhubSymbol)
      .forEach((item) => {
        socket.send(JSON.stringify({ type: 'subscribe', symbol: item.finnhubSymbol }))
      })
  },
  onMessage: (event) => {
    const payload = JSON.parse(event.data) as Record<string, unknown>
    if (payload.type === 'ping') {
      finnhubSocket.send(JSON.stringify({ type: 'pong' }))
      return
    }

    parseFinnhubQuote(payload).forEach((quote) => marketStore.upsertQuote(quote))
  },
})

async function syncVisibleCharts(forceHistory = false) {
  await syncCurrentChart(forceHistory)
  await syncSecondaryCharts(forceHistory)
}

async function syncChart(symbolId: string, timeframe: SupportedTimeframe, forceHistory = false) {
  await marketStore.loadHistory(symbolId, timeframe, forceHistory)
  await indicatorStore.compute(symbolId, timeframe, forceHistory)
}

async function syncCurrentChart(forceHistory = false) {
  await syncChart(marketStore.currentSymbolId, marketStore.selectedTimeframe, forceHistory)
}

async function syncSecondaryCharts(forceHistory = false) {
  const secondaryCharts = marketStore.chartSymbols.filter((item) => item.id !== marketStore.currentSymbolId)
  await Promise.all(secondaryCharts.map((chartSymbol) => syncChart(chartSymbol.id, marketStore.selectedTimeframe, forceHistory)))
}

function openMatrixCell(symbolId: string, timeframe: (typeof SIGNAL_MATRIX_TIMEFRAMES)[number]) {
  marketStore.setCurrentSymbol(symbolId)
  marketStore.setTimeframe(timeframe)
}

function refreshMatrix(forceHistory = false) {
  void indicatorStore.refreshMatrix(marketStore.watchlistIds.slice(0, 6), SIGNAL_MATRIX_TIMEFRAMES, forceHistory)
}

onMounted(async () => {
  marketStore.init()
  await syncCurrentChart(false)
  void syncSecondaryCharts(false)
  marketStore.startPolling()
  refreshMatrix(false)
  maybeAnalyzeCurrentView()

  historyRefreshTimer = window.setInterval(() => {
    void syncCurrentChart(false)
    void syncSecondaryCharts(false)
  }, 120000)

  matrixRefreshTimer = window.setInterval(() => {
    refreshMatrix(false)
  }, 60000)
})

watch(
  () => [marketStore.currentSymbolId, marketStore.selectedTimeframe] as const,
  () => {
    void marketStore.refreshQuotes([marketStore.currentSymbolId])
    void syncCurrentChart(false)
    void syncSecondaryCharts(false)
    if (marketStore.currentSymbol.category === 'crypto') {
      binanceSocket.reconnect()
    } else {
      binanceSocket.disconnect()
    }
    maybeAnalyzeCurrentView()
  },
  { immediate: true },
)

watch(
  () => [marketStore.settings.finnhubKey, marketStore.watchlistIds.join(',')] as const,
  () => {
    if (marketStore.settings.finnhubKey) {
      finnhubSocket.reconnect()
    } else {
      finnhubSocket.disconnect()
    }
  },
  { immediate: true },
)

watch(
  () => indicatorStore.activeIndicators.map((item) => item.key).join(','),
  () => {
    void syncVisibleCharts(false)
    refreshMatrix(false)
  },
)

watch(
  () => marketStore.watchlistIds.join(','),
  () => {
    void marketStore.refreshQuotes()
    void syncVisibleCharts(false)
    refreshMatrix(false)
  },
)

watch(
  () => marketStore.chartSymbols.map((item) => item.id).join(','),
  () => {
    void syncSecondaryCharts(false)
  },
)

watch(
  () => [
    marketStore.currentSymbolId,
    marketStore.selectedTimeframe,
    marketStore.quotes[marketStore.currentSymbolId]?.timestamp ?? 0,
    (currentAnalysis.value as { computedAt?: number } | undefined)?.computedAt ?? 0,
    currentInsight.value?.content ?? '',
    currentInsight.value?.loading ?? false,
  ] as const,
  () => {
    maybeAnalyzeCurrentView()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  marketStore.stopPolling()
  binanceSocket.disconnect()
  finnhubSocket.disconnect()
  if (historyRefreshTimer != null) {
    window.clearInterval(historyRefreshTimer)
  }
  if (matrixRefreshTimer != null) {
    window.clearInterval(matrixRefreshTimer)
  }
})
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
