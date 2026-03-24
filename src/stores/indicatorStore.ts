import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { INDICATORS, PRESETS, SIGNAL_MATRIX_TIMEFRAMES, STORAGE_KEYS } from '../constants/markets'
import type { IndicatorGroup, SupportedTimeframe, TimeframeSignalCell } from '../types/market'
import { useTechnicalAnalysis } from '../composables/useTechnicalAnalysis'
import { buildSignals } from '../composables/useSignalEngine'
import { buildCacheKey, fetchHistoricalCandles, marketById } from '../utils/marketData'
import { readLocalStorage, writeLocalStorage } from '../utils/storage'
import { useMarketStore } from './marketStore'

const DEFAULT_ENABLED = ['ema9', 'ema21', 'sma50', 'bollinger', 'vwap', 'rsi', 'macd', 'adx', 'stoch', 'mfi', 'supertrend']

type GroupState = Record<IndicatorGroup, boolean>

const DEFAULT_GROUPS: GroupState = {
  trend: true,
  momentum: true,
  volatility: true,
  volume: true,
  pattern: true,
  support: true,
  advanced: true,
}

export const useIndicatorStore = defineStore('indicator', () => {
  const { calculate } = useTechnicalAnalysis()
  const enabledIndicators = ref<string[]>(readLocalStorage(STORAGE_KEYS.enabledIndicators, DEFAULT_ENABLED))
  const enabledGroups = ref<GroupState>(readLocalStorage(STORAGE_KEYS.enabledGroups, DEFAULT_GROUPS))
  const analysisByKey = ref<Record<string, ReturnType<typeof buildSignals> & Record<string, unknown>>>({})
  const loadingByKey = ref<Record<string, boolean>>({})
  const errorByKey = ref<Record<string, string>>({})
  const timeframeMatrix = ref<Record<string, TimeframeSignalCell>>({})

  const activeIndicators = computed(() =>
    INDICATORS.filter((item) => enabledGroups.value[item.group] && enabledIndicators.value.includes(item.key)),
  )

  async function compute(symbolId: string, timeframe: SupportedTimeframe, force = false) {
    const marketStore = useMarketStore()
    const candles = marketStore.candlesFor(symbolId, timeframe)
    const key = buildCacheKey(symbolId, timeframe)
    const lastClosedTime = candles.at(-1)?.time
    const cached = analysisByKey.value[key] as (Record<string, unknown> & { lastClosedTime?: number }) | undefined

    if (!force && cached?.lastClosedTime === lastClosedTime) {
      return cached
    }

    if (!candles.length) {
      return null
    }

    loadingByKey.value[key] = true
    errorByKey.value[key] = ''

    try {
      const workerResult = await calculate(symbolId, timeframe, candles, lastClosedTime)
      const { signals, aggregate } = buildSignals(workerResult as never, activeIndicators.value.map((item) => item.key))
      const result = {
        ...workerResult,
        signals,
        aggregate,
      }
      analysisByKey.value[key] = result
      return result
    } catch (error) {
      errorByKey.value[key] = error instanceof Error ? error.message : 'Indicator calculation failed'
      return null
    } finally {
      loadingByKey.value[key] = false
    }
  }

  async function ensure(symbolId: string, timeframe: SupportedTimeframe, forceHistory = false) {
    const marketStore = useMarketStore()
    await marketStore.loadHistory(symbolId, timeframe, forceHistory)
    return compute(symbolId, timeframe)
  }

  function analysisFor(symbolId: string, timeframe: SupportedTimeframe) {
    return analysisByKey.value[buildCacheKey(symbolId, timeframe)] as
      | (Record<string, unknown> & { signals: unknown[]; aggregate: unknown })
      | undefined
  }

  function toggleIndicator(key: string) {
    enabledIndicators.value = enabledIndicators.value.includes(key)
      ? enabledIndicators.value.filter((item) => item !== key)
      : [...enabledIndicators.value, key]
  }

  function toggleGroup(group: IndicatorGroup) {
    enabledGroups.value = {
      ...enabledGroups.value,
      [group]: !enabledGroups.value[group],
    }
  }

  function applyPreset(preset: keyof typeof PRESETS) {
    enabledIndicators.value = [...PRESETS[preset]]
  }

  async function refreshMatrix(symbolIds: string[], timeframes = SIGNAL_MATRIX_TIMEFRAMES) {
    const marketStore = useMarketStore()

    for (const symbolId of symbolIds) {
      const symbol = marketById(symbolId)
      if (!symbol) {
        continue
      }

      for (const timeframe of timeframes) {
        const key = `${symbolId}:${timeframe}`
        timeframeMatrix.value[key] = {
          symbol: symbolId,
          timeframe,
          loading: true,
          strength: timeframeMatrix.value[key]?.strength ?? 'neutral',
          updatedAt: timeframeMatrix.value[key]?.updatedAt,
        }

        try {
          const candles = await fetchHistoricalCandles({
            symbol,
            timeframe,
            settings: marketStore.settings,
            limit: 250,
          })
          const workerResult = await calculate(symbolId, timeframe, candles, candles.at(-1)?.time)
          const { aggregate } = buildSignals(workerResult as never, activeIndicators.value.map((item) => item.key))
          timeframeMatrix.value[key] = {
            symbol: symbolId,
            timeframe,
            loading: false,
            strength: aggregate.conclusion,
            updatedAt: Date.now(),
          }
        } catch {
          timeframeMatrix.value[key] = {
            symbol: symbolId,
            timeframe,
            loading: false,
            strength: 'neutral',
            updatedAt: Date.now(),
          }
        }
      }
    }
  }

  watch(enabledIndicators, (value) => writeLocalStorage(STORAGE_KEYS.enabledIndicators, value), { deep: true })
  watch(enabledGroups, (value) => writeLocalStorage(STORAGE_KEYS.enabledGroups, value), { deep: true })

  return {
    enabledIndicators,
    enabledGroups,
    activeIndicators,
    analysisByKey,
    loadingByKey,
    errorByKey,
    timeframeMatrix,
    compute,
    ensure,
    analysisFor,
    toggleIndicator,
    toggleGroup,
    applyPreset,
    refreshMatrix,
  }
})
