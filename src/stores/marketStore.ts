import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { DEFAULT_SETTINGS, DEFAULT_WATCHLIST, MARKETS, STORAGE_KEYS } from '../constants/markets'
import type { OHLCV, PriceAlert, PriceSnapshot, SupportedTimeframe } from '../types/market'
import { fetchHistoricalCandles, fetchLatestQuote, buildCacheKey, marketById } from '../utils/marketData'
import { readLocalStorage, uid, writeLocalStorage } from '../utils/storage'

export const useMarketStore = defineStore('market', () => {
  const settings = ref(readLocalStorage(STORAGE_KEYS.settings, DEFAULT_SETTINGS))
  const watchlistIds = ref<string[]>(readLocalStorage(STORAGE_KEYS.watchlist, DEFAULT_WATCHLIST))
  const alerts = ref<PriceAlert[]>(readLocalStorage(STORAGE_KEYS.alerts, []))
  const currentSymbolId = ref(watchlistIds.value[0] ?? MARKETS[0].id)
  const selectedTimeframe = ref<SupportedTimeframe>('1h')
  const quotes = ref<Record<string, PriceSnapshot>>({})
  const candlesByKey = ref<Record<string, OHLCV[]>>({})
  const loadingHistory = ref<Record<string, boolean>>({})
  const historyErrors = ref<Record<string, string>>({})
  const quotesLoading = ref(false)
  const quoteError = ref('')
  let pollingTimer: number | null = null

  const watchlist = computed(() =>
    watchlistIds.value
      .map((id) => MARKETS.find((item) => item.id === id))
      .filter((item): item is NonNullable<typeof item> => Boolean(item)),
  )
  const currentSymbol = computed(() => marketById(currentSymbolId.value) ?? MARKETS[0])
  const chartSymbols = computed(() => {
    const symbols = [currentSymbol.value, ...watchlist.value.filter((item) => item.id !== currentSymbol.value.id)]
    return symbols.slice(0, settings.value.multiChartCount)
  })

  function applyTheme(theme: 'dark' | 'light') {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }

  function init() {
    applyTheme(settings.value.theme)
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => undefined)
    }
  }

  function candleKey(symbolId = currentSymbolId.value, timeframe = selectedTimeframe.value) {
    return buildCacheKey(symbolId, timeframe)
  }

  function candlesFor(symbolId = currentSymbolId.value, timeframe = selectedTimeframe.value) {
    return candlesByKey.value[candleKey(symbolId, timeframe)] ?? []
  }

  async function loadHistory(symbolId = currentSymbolId.value, timeframe = selectedTimeframe.value, force = false) {
    const key = candleKey(symbolId, timeframe)
    if (!force && candlesByKey.value[key]?.length) {
      return candlesByKey.value[key]
    }

    const symbol = marketById(symbolId)
    if (!symbol) {
      return []
    }

    loadingHistory.value[key] = true
    historyErrors.value[key] = ''

    try {
      const candles = await fetchHistoricalCandles({
        symbol,
        timeframe,
        settings: settings.value,
      })
      candlesByKey.value[key] = candles
      return candles
    } catch (error) {
      historyErrors.value[key] = error instanceof Error ? error.message : 'Failed to load history'
      return []
    } finally {
      loadingHistory.value[key] = false
    }
  }

  function upsertQuote(snapshot: PriceSnapshot) {
    quotes.value[snapshot.symbol] = snapshot
    processAlerts(snapshot)
  }

  function upsertRealtimeCandle(symbolId: string, timeframe: SupportedTimeframe, candle: OHLCV, closed = false) {
    const key = candleKey(symbolId, timeframe)
    const existing = candlesByKey.value[key] ?? []
    const index = existing.findIndex((item) => item.time === candle.time)

    if (index >= 0) {
      existing[index] = candle
    } else {
      existing.push(candle)
      existing.sort((a, b) => a.time - b.time)
      if (existing.length > 500) {
        existing.shift()
      }
    }

    candlesByKey.value[key] = [...existing]

    if (closed) {
      quotes.value[symbolId] = {
        symbol: symbolId,
        price: candle.close,
        changePercent: quotes.value[symbolId]?.changePercent ?? 0,
        source: quotes.value[symbolId]?.source ?? 'yahoo',
        timestamp: candle.time,
        volume: candle.volume,
      }
    }
  }

  async function refreshQuotes(symbolIds = watchlistIds.value) {
    quotesLoading.value = true
    quoteError.value = ''

    try {
      await Promise.all(
        symbolIds.map(async (id) => {
          const symbol = marketById(id)
          if (!symbol) {
            return
          }

          const snapshot = await fetchLatestQuote(symbol, settings.value)
          upsertQuote(snapshot)
        }),
      )
    } catch (error) {
      quoteError.value = error instanceof Error ? error.message : 'Failed to refresh quotes'
    } finally {
      quotesLoading.value = false
    }
  }

  function startPolling() {
    stopPolling()
    void refreshQuotes()
    pollingTimer = window.setInterval(() => {
      void refreshQuotes()
    }, 5000)
  }

  function stopPolling() {
    if (pollingTimer != null) {
      window.clearInterval(pollingTimer)
      pollingTimer = null
    }
  }

  function setCurrentSymbol(symbolId: string) {
    currentSymbolId.value = symbolId
  }

  function setTimeframe(timeframe: SupportedTimeframe) {
    selectedTimeframe.value = timeframe
  }

  function toggleTheme() {
    settings.value.theme = settings.value.theme === 'dark' ? 'light' : 'dark'
    applyTheme(settings.value.theme)
  }

  function updateSettings(patch: Partial<typeof settings.value>) {
    settings.value = { ...settings.value, ...patch }
    applyTheme(settings.value.theme)
  }

  function toggleWatchlist(symbolId: string) {
    if (watchlistIds.value.includes(symbolId)) {
      watchlistIds.value = watchlistIds.value.filter((item) => item !== symbolId)
      if (!watchlistIds.value.length) {
        watchlistIds.value = [MARKETS[0].id]
      }
    } else {
      watchlistIds.value = [...watchlistIds.value, symbolId]
    }

    if (!watchlistIds.value.includes(currentSymbolId.value)) {
      currentSymbolId.value = watchlistIds.value[0]
    }
  }

  function setMultiChartCount(count: 1 | 2 | 4) {
    settings.value.multiChartCount = count
  }

  function addAlert(symbol: string, target: number, direction: 'above' | 'below') {
    alerts.value = [...alerts.value, { id: uid('alert'), symbol, target, direction }]
  }

  function removeAlert(id: string) {
    alerts.value = alerts.value.filter((item) => item.id !== id)
  }

  function processAlerts(snapshot: PriceSnapshot) {
    alerts.value = alerts.value.map((alert) => {
      if (alert.symbol !== snapshot.symbol || alert.triggeredAt) {
        return alert
      }

      const hit = alert.direction === 'above' ? snapshot.price >= alert.target : snapshot.price <= alert.target
      if (!hit) {
        return alert
      }

      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(`Price alert ${snapshot.symbol}`, {
          body: `${snapshot.symbol} chạm ${snapshot.price.toFixed(2)} (${alert.direction} ${alert.target.toFixed(2)})`,
        })
      }

      return { ...alert, triggeredAt: Date.now() }
    })
  }

  watch(watchlistIds, (value) => writeLocalStorage(STORAGE_KEYS.watchlist, value), { deep: true })
  watch(settings, (value) => writeLocalStorage(STORAGE_KEYS.settings, value), { deep: true })
  watch(alerts, (value) => writeLocalStorage(STORAGE_KEYS.alerts, value), { deep: true })

  return {
    settings,
    watchlistIds,
    watchlist,
    currentSymbolId,
    currentSymbol,
    selectedTimeframe,
    quotes,
    quotesLoading,
    quoteError,
    candlesByKey,
    loadingHistory,
    historyErrors,
    alerts,
    chartSymbols,
    init,
    candleKey,
    candlesFor,
    loadHistory,
    refreshQuotes,
    startPolling,
    stopPolling,
    upsertQuote,
    upsertRealtimeCandle,
    setCurrentSymbol,
    setTimeframe,
    toggleTheme,
    updateSettings,
    toggleWatchlist,
    setMultiChartCount,
    addAlert,
    removeAlert,
  }
})
