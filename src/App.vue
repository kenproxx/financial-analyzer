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
import { convertBinanceKline, parseFinnhubQuote, timeframeConfig } from './utils/marketData'

const marketStore = useMarketStore()
const indicatorStore = useIndicatorStore()
const aiStore = useAiStore()

const alertTarget = ref('')
const alertDirection = ref<'above' | 'below'>('above')
let historyRefreshTimer: number | null = null
let matrixRefreshTimer: number | null = null

const currentAnalysis = computed(() => indicatorStore.analysisFor(marketStore.currentSymbolId, marketStore.selectedTimeframe) as any)
const currentInsight = computed(() => aiStore.insights[`${marketStore.currentSymbolId}:${marketStore.selectedTimeframe}`])
const historyLoading = computed(
  () => marketStore.loadingHistory[marketStore.candleKey(marketStore.currentSymbolId, marketStore.selectedTimeframe)],
)

const binanceSocket = useWebSocket({
  url: () => {
    const symbol = marketStore.currentSymbol
    if (symbol.category !== 'crypto' || !symbol.binanceSymbol) {
      return null
    }

    const interval = timeframeConfig(marketStore.selectedTimeframe).binanceInterval
    return `wss://stream.binance.com:9443/ws/${symbol.binanceSymbol}@kline_${interval}`
  },
  autoReconnect: true,
  onMessage: (event) => {
    const payload = JSON.parse(event.data) as Record<string, unknown>
    const candle = convertBinanceKline(payload)
    if (!candle) {
      return
    }

    const isClosed = Boolean((payload.k as Record<string, unknown> | undefined)?.x)
    marketStore.upsertRealtimeCandle(marketStore.currentSymbolId, marketStore.selectedTimeframe, candle, isClosed)
    marketStore.upsertQuote({
      symbol: marketStore.currentSymbolId,
      price: candle.close,
      changePercent: marketStore.quotes[marketStore.currentSymbolId]?.changePercent ?? 0,
      source: 'binance',
      timestamp: candle.time,
      volume: candle.volume,
    })
    if (isClosed) {
      void indicatorStore.compute(marketStore.currentSymbolId, marketStore.selectedTimeframe, true)
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

async function syncActiveView(forceHistory = false) {
  await marketStore.loadHistory(marketStore.currentSymbolId, marketStore.selectedTimeframe, forceHistory)
  await indicatorStore.compute(marketStore.currentSymbolId, marketStore.selectedTimeframe, forceHistory)
}

function openMatrixCell(symbolId: string, timeframe: (typeof SIGNAL_MATRIX_TIMEFRAMES)[number]) {
  marketStore.setCurrentSymbol(symbolId)
  marketStore.setTimeframe(timeframe)
}

function addAlertFromForm() {
  const target = Number(alertTarget.value)
  if (!Number.isFinite(target) || target <= 0) {
    return
  }

  marketStore.addAlert(marketStore.currentSymbolId, target, alertDirection.value)
  alertTarget.value = ''
}

function refreshMatrix(forceHistory = false) {
  void indicatorStore.refreshMatrix(marketStore.watchlistIds.slice(0, 6), SIGNAL_MATRIX_TIMEFRAMES, forceHistory)
}

onMounted(async () => {
  marketStore.init()
  await syncActiveView(false)
  marketStore.startPolling()
  refreshMatrix(false)

  historyRefreshTimer = window.setInterval(() => {
    void syncActiveView(false)
  }, 120000)

  matrixRefreshTimer = window.setInterval(() => {
    refreshMatrix(false)
  }, 60000)
})

watch(
  () => [marketStore.currentSymbolId, marketStore.selectedTimeframe] as const,
  () => {
    void syncActiveView(false)
    if (marketStore.currentSymbol.category === 'crypto') {
      binanceSocket.reconnect()
    } else {
      binanceSocket.disconnect()
    }
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
    void indicatorStore.compute(marketStore.currentSymbolId, marketStore.selectedTimeframe, false)
    refreshMatrix(false)
  },
)

watch(
  () => marketStore.watchlistIds.join(','),
  () => {
    void marketStore.refreshQuotes()
    refreshMatrix(false)
  },
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
          <h1 class="font-display text-3xl text-slate-50 lg:text-4xl">Realtime technical dashboard cho crypto, forex, commodities, index và cổ phiếu VN</h1>
          <p class="mt-2 max-w-4xl text-sm text-slate-400">
            Live quotes, multi-source fallback, technical analysis bằng Web Worker, signal matrix nhiều khung giờ và AI market insight.
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button class="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-200" @click="marketStore.toggleTheme()">
            {{ marketStore.settings.theme === 'dark' ? 'Light mode' : 'Dark mode' }}
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
            {{ count }} chart
          </button>
        </div>
      </header>

      <div class="grid gap-6 xl:grid-cols-[360px,minmax(0,1fr),400px]">
        <div class="space-y-6">
          <MarketList
            :watchlist-ids="marketStore.watchlistIds"
            :current-symbol-id="marketStore.currentSymbolId"
            :quotes="marketStore.quotes"
            @select="marketStore.setCurrentSymbol"
            @toggle-watchlist="marketStore.toggleWatchlist"
            @add-alert="marketStore.addAlert"
          />

          <section class="rounded-3xl border border-slate-800 bg-slate-950/70 p-4 shadow-2xl shadow-slate-950/30">
            <div class="mb-4">
              <p class="text-xs uppercase tracking-[0.3em] text-slate-500">Settings</p>
              <h2 class="font-display text-lg text-slate-100">API keys & alerts</h2>
            </div>

            <div class="grid gap-3">
              <label class="grid gap-2 text-sm text-slate-300">
                Finnhub Key
                <input
                  :value="marketStore.settings.finnhubKey"
                  class="rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-3 outline-none focus:border-emerald-400"
                  type="password"
                  @input="marketStore.updateSettings({ finnhubKey: ($event.target as HTMLInputElement).value })"
                />
              </label>
              <label class="grid gap-2 text-sm text-slate-300">
                Alpha Vantage Key
                <input
                  :value="marketStore.settings.alphaVantageKey"
                  class="rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-3 outline-none focus:border-emerald-400"
                  type="password"
                  @input="marketStore.updateSettings({ alphaVantageKey: ($event.target as HTMLInputElement).value })"
                />
              </label>
              <label class="grid gap-2 text-sm text-slate-300">
                OpenAI Key
                <input
                  :value="marketStore.settings.openAiKey"
                  class="rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-3 outline-none focus:border-emerald-400"
                  type="password"
                  @input="marketStore.updateSettings({ openAiKey: ($event.target as HTMLInputElement).value })"
                />
              </label>
              <label class="grid gap-2 text-sm text-slate-300">
                OpenAI Model
                <input
                  :value="marketStore.settings.openAiModel"
                  class="rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-3 outline-none focus:border-emerald-400"
                  type="text"
                  @input="marketStore.updateSettings({ openAiModel: ($event.target as HTMLInputElement).value })"
                />
              </label>
            </div>

            <div class="mt-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
              <p class="mb-3 text-sm font-semibold text-slate-100">Price alerts cho {{ marketStore.currentSymbolId }}</p>
              <div class="grid gap-2 sm:grid-cols-[1fr,130px]">
                <input
                  v-model="alertTarget"
                  class="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-400"
                  placeholder="Mức giá mục tiêu"
                  type="number"
                />
                <select
                  v-model="alertDirection"
                  class="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-400"
                >
                  <option value="above">Above</option>
                  <option value="below">Below</option>
                </select>
              </div>
              <button class="mt-3 rounded-full border border-emerald-400/50 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200" @click="addAlertFromForm">
                Thêm alert
              </button>

              <div class="mt-4 grid gap-2">
                <div
                  v-for="alert in marketStore.alerts.filter((item) => item.symbol === marketStore.currentSymbolId)"
                  :key="alert.id"
                  class="flex items-center justify-between rounded-2xl border border-slate-800 px-3 py-2 text-sm"
                >
                  <span class="text-slate-300">
                    {{ alert.direction }} {{ alert.target }} <span v-if="alert.triggeredAt" class="text-emerald-300">triggered</span>
                  </span>
                  <button class="text-xs text-rose-300" @click="marketStore.removeAlert(alert.id)">Xóa</button>
                </div>
              </div>
            </div>
          </section>
        </div>

        <main class="space-y-6">
          <section class="rounded-[2rem] border border-slate-800 bg-slate-950/60 p-4 shadow-2xl shadow-slate-950/30">
            <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p class="text-xs uppercase tracking-[0.3em] text-slate-500">Timeframe</p>
                <h2 class="font-display text-lg text-slate-100">Khung thời gian</h2>
              </div>
              <button class="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-200" @click="syncActiveView(true)">
                Reload history
              </button>
            </div>
            <TimeframeSelector v-model="marketStore.selectedTimeframe" :options="TIMEFRAMES" />
          </section>

          <div
            class="grid gap-6"
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
              :symbol="chartSymbol"
              :timeframe="marketStore.selectedTimeframe"
              :candles="marketStore.candlesFor(chartSymbol.id, marketStore.selectedTimeframe)"
              :analysis="indicatorStore.analysisFor(chartSymbol.id, marketStore.selectedTimeframe) as any"
              :enabled-indicators="indicatorStore.activeIndicators.map((item) => item.key)"
              :loading="historyLoading && chartSymbol.id === marketStore.currentSymbolId"
            />
          </div>

          <AIInsightPanel
            :symbol="marketStore.currentSymbol"
            :timeframe="marketStore.selectedTimeframe"
            :insight="currentInsight"
            @analyze="(force) => aiStore.analyze(marketStore.currentSymbolId, marketStore.selectedTimeframe, force)"
          />

          <SignalPanel
            :analysis="currentAnalysis"
            :watchlist="marketStore.watchlist"
            :matrix="indicatorStore.timeframeMatrix"
            :timeframes="SIGNAL_MATRIX_TIMEFRAMES"
            @open-cell="openMatrixCell"
          />
        </main>

        <div class="space-y-6">
          <IndicatorPanel
            :enabled-indicators="indicatorStore.enabledIndicators"
            :enabled-groups="indicatorStore.enabledGroups"
            @toggle-indicator="indicatorStore.toggleIndicator"
            @toggle-group="indicatorStore.toggleGroup"
            @toggle-all="indicatorStore.setAllIndicators"
            @preset="indicatorStore.applyPreset"
          />

          <section class="rounded-3xl border border-slate-800 bg-slate-950/70 p-4 shadow-2xl shadow-slate-950/30">
            <div class="mb-4">
              <p class="text-xs uppercase tracking-[0.3em] text-slate-500">System Status</p>
              <h2 class="font-display text-lg text-slate-100">Nguồn dữ liệu</h2>
            </div>

            <div class="grid gap-3 text-sm">
              <div class="rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
                <p class="text-slate-100">Quote polling</p>
                <p class="mt-1 text-slate-500">{{ marketStore.quotesLoading ? 'Đang refresh' : '5s/polling' }}</p>
              </div>
              <div class="rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
                <p class="text-slate-100">History / indicators</p>
                <p class="mt-1 text-slate-500">{{ historyLoading ? 'Loading candles...' : 'Ready with worker compute' }}</p>
              </div>
              <div class="rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
                <p class="text-slate-100">Fallback chain</p>
                <p class="mt-1 text-slate-500">Crypto: Binance → Yahoo → Alpha. Others: Finnhub/Yahoo → Alpha.</p>
              </div>
              <div v-if="marketStore.quoteError" class="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-rose-200">
                {{ marketStore.quoteError }}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>
