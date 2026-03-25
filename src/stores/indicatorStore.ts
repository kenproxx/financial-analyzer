import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { INDICATORS, PRESETS, SIGNAL_MATRIX_TIMEFRAMES, STORAGE_KEYS } from '../constants/markets'
import type { AnalysisResult, IndicatorGroup, SupportedTimeframe, TimeframeSignalCell } from '../types/market'
import { useTechnicalAnalysis } from '../composables/useTechnicalAnalysis'
import { buildSignals } from '../composables/useSignalEngine'
import { buildCacheKey, marketById } from '../utils/marketData'
import { readLocalStorage, writeLocalStorage } from '../utils/storage'
import { useMarketStore } from './marketStore'

const DEFAULT_ENABLED = INDICATORS.map((item) => item.key)

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

function createGroupState(enabled: boolean): GroupState {
  return {
    trend: enabled,
    momentum: enabled,
    volatility: enabled,
    volume: enabled,
    pattern: enabled,
    support: enabled,
    advanced: enabled,
  }
}

const MATRIX_CONCURRENCY = 8
type StoredAnalysis = AnalysisResult

export const useIndicatorStore = defineStore('indicator', () => {
  const { calculate } = useTechnicalAnalysis()
  const hasMigratedDefaults = readLocalStorage(STORAGE_KEYS.indicatorDefaultsMigrated, false)
  const enabledIndicators = ref<string[]>(readLocalStorage(STORAGE_KEYS.enabledIndicators, DEFAULT_ENABLED))
  const enabledGroups = ref<GroupState>(readLocalStorage(STORAGE_KEYS.enabledGroups, DEFAULT_GROUPS))
  const analysisByKey = ref<Record<string, StoredAnalysis>>({})
  const loadingByKey = ref<Record<string, boolean>>({})
  const errorByKey = ref<Record<string, string>>({})
  const timeframeMatrix = ref<Record<string, TimeframeSignalCell>>({})
  const matrixRefreshing = ref(false)

  if (!hasMigratedDefaults) {
    enabledIndicators.value = [...DEFAULT_ENABLED]
    enabledGroups.value = createGroupState(true)
    writeLocalStorage(STORAGE_KEYS.enabledIndicators, enabledIndicators.value)
    writeLocalStorage(STORAGE_KEYS.enabledGroups, enabledGroups.value)
    writeLocalStorage(STORAGE_KEYS.indicatorDefaultsMigrated, true)
  }

  function delay(ms: number) {
    return new Promise((resolve) => window.setTimeout(resolve, ms))
  }

  async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
    const queue = [...items]
    const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
      while (queue.length) {
        const item = queue.shift()
        if (!item) {
          return
        }

        await worker(item)
      }
    })

    await Promise.all(runners)
  }

  const activeIndicators = computed(() =>
    INDICATORS.filter((item) => enabledGroups.value[item.group] && enabledIndicators.value.includes(item.key)),
  )

  function indicatorSignature() {
    return activeIndicators.value.map((item) => item.key).sort().join('|')
  }

  async function compute(symbolId: string, timeframe: SupportedTimeframe, force = false): Promise<StoredAnalysis | null> {
    const marketStore = useMarketStore()
    const candles = marketStore.candlesFor(symbolId, timeframe)
    const key = buildCacheKey(symbolId, timeframe)
    const lastClosedTime = candles.at(-1)?.time
    const cached = analysisByKey.value[key]
    const currentSignature = indicatorSignature()

    if (!force && cached?.lastClosedTime === lastClosedTime && cached.series.__indicatorSignature === currentSignature) {
      return cached
    }

    if (!candles.length) {
      return null
    }

    loadingByKey.value[key] = true
    errorByKey.value[key] = ''

    try {
      const workerResult = await calculate(symbolId, timeframe, candles, lastClosedTime)
      const { signals, aggregate } = buildSignals(workerResult, activeIndicators.value.map((item) => item.key))
      const result: StoredAnalysis = {
        ...workerResult,
        series: {
          ...workerResult.series,
          __indicatorSignature: currentSignature,
        },
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
    return compute(symbolId, timeframe, forceHistory)
  }

  function analysisFor(symbolId: string, timeframe: SupportedTimeframe): StoredAnalysis | undefined {
    return analysisByKey.value[buildCacheKey(symbolId, timeframe)]
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

  function setAllIndicators(enabled: boolean) {
    enabledIndicators.value = enabled ? INDICATORS.map((item) => item.key) : []
    enabledGroups.value = createGroupState(enabled)
  }

  async function refreshMatrix(symbolIds: string[], timeframes = SIGNAL_MATRIX_TIMEFRAMES, forceHistory = false) {
    if (matrixRefreshing.value) {
      return
    }

    matrixRefreshing.value = true

    try {
      const jobs = symbolIds.flatMap((symbolId) => {
        const symbol = marketById(symbolId)
        return symbol ? timeframes.map((timeframe) => ({ symbolId, timeframe })) : []
      })

      for (const { symbolId, timeframe } of jobs) {
        const key = `${symbolId}:${timeframe}`
        const previous = timeframeMatrix.value[key]
        timeframeMatrix.value[key] = {
          symbol: symbolId,
          timeframe,
          loading: true,
          hasData: previous?.hasData ?? false,
          strength: previous?.strength ?? 'neutral',
          updatedAt: previous?.updatedAt,
          error: '',
        }
      }

      await runWithConcurrency(jobs, MATRIX_CONCURRENCY, async ({ symbolId, timeframe }) => {
        const key = `${symbolId}:${timeframe}`

        try {
          const result = await ensure(symbolId, timeframe, forceHistory)
          timeframeMatrix.value[key] = {
            symbol: symbolId,
            timeframe,
            loading: false,
            hasData: Boolean(result),
            strength: result?.aggregate?.conclusion ?? 'neutral',
            updatedAt: Date.now(),
            error: '',
          }
        } catch (error) {
          timeframeMatrix.value[key] = {
            symbol: symbolId,
            timeframe,
            loading: false,
            hasData: false,
            strength: 'neutral',
            updatedAt: Date.now(),
            error: error instanceof Error ? error.message : 'Matrix refresh failed',
          }
        }

        await delay(75)
      })
    } finally {
      matrixRefreshing.value = false
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
    matrixRefreshing,
    compute,
    ensure,
    analysisFor,
    toggleIndicator,
    toggleGroup,
    applyPreset,
    setAllIndicators,
    refreshMatrix,
  }
})
