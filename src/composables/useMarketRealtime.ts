import { onBeforeUnmount, onMounted, watch } from 'vue'
import { SIGNAL_MATRIX_TIMEFRAMES } from '../constants/markets'
import { useWebSocket } from './useWebSocket'
import { useAiStore } from '../stores/aiStore'
import { useIndicatorStore } from '../stores/indicatorStore'
import { useMarketStore } from '../stores/marketStore'
import type { SupportedTimeframe } from '../types/market'
import { convertBinanceKline, marketByBinanceSymbol, parseFinnhubQuote, timeframeConfig } from '../utils/marketData'

export function useMarketRealtime() {
  const marketStore = useMarketStore()
  const indicatorStore = useIndicatorStore()
  const aiStore = useAiStore()

  let historyRefreshTimer: number | null = null
  let matrixRefreshTimer: number | null = null
  let activeBinanceSymbolId: string | null = null
  let activeBinanceTimeframe: SupportedTimeframe | null = null
  let activeBinanceInterval: string | null = null

  function maybeAnalyzeCurrentView() {
    return aiStore.insights[`${marketStore.currentSymbolId}:${marketStore.selectedTimeframe}`]
  }

  const binanceSocket = useWebSocket({
    url: () => {
      const symbol = marketStore.currentSymbol
      if (symbol.category !== 'crypto' || !symbol.binanceSymbol) {
        activeBinanceSymbolId = null
        activeBinanceTimeframe = null
        activeBinanceInterval = null
        return null
      }

      const timeframe = marketStore.selectedTimeframe
      const interval = timeframeConfig(timeframe).binanceInterval
      activeBinanceSymbolId = symbol.id
      activeBinanceTimeframe = timeframe
      activeBinanceInterval = interval
      return `wss://stream.binance.com:9443/ws/${symbol.binanceSymbol}@kline_${interval}`
    },
    autoReconnect: true,
    onMessage: (event) => {
      const payload = JSON.parse(event.data) as Record<string, unknown>
      const payloadSymbol = String(payload.s ?? (payload.k as Record<string, unknown> | undefined)?.s ?? '')
      const payloadInterval = String((payload.k as Record<string, unknown> | undefined)?.i ?? '')
      const streamSymbolId = marketByBinanceSymbol(payloadSymbol)?.id ?? activeBinanceSymbolId
      const streamTimeframe = activeBinanceTimeframe
      const candle = convertBinanceKline(payload)
      if (
        !candle ||
        !streamSymbolId ||
        !streamTimeframe ||
        (activeBinanceSymbolId && streamSymbolId !== activeBinanceSymbolId) ||
        (activeBinanceInterval && payloadInterval && payloadInterval !== activeBinanceInterval)
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

  async function syncVisibleCharts(forceHistory = false) {
    await syncCurrentChart(forceHistory)
    await syncSecondaryCharts(forceHistory)
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
      (indicatorStore.analysisFor(marketStore.currentSymbolId, marketStore.selectedTimeframe) as { computedAt?: number } | undefined)
        ?.computedAt ?? 0,
      aiStore.insights[`${marketStore.currentSymbolId}:${marketStore.selectedTimeframe}`]?.content ?? '',
      aiStore.insights[`${marketStore.currentSymbolId}:${marketStore.selectedTimeframe}`]?.loading ?? false,
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

  return {
    syncVisibleCharts,
    refreshMatrix,
  }
}
