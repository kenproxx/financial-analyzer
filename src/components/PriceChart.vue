<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type UTCTimestamp,
} from 'lightweight-charts'
import type { MarketSymbol, OHLCV } from '../types/market'
import { formatCompact, formatPrice } from '../utils/format'

const props = defineProps<{
  symbol: MarketSymbol
  timeframe: string
  candles: OHLCV[]
  enabledIndicators: string[]
  analysis?: Record<string, any> | null
  loading?: boolean
}>()

const chartRoot = ref<HTMLDivElement | null>(null)
const chartSurface = ref<HTMLDivElement | null>(null)
const tooltip = ref({
  visible: false,
  left: 16,
  top: 16,
  text: '',
})

let chart: IChartApi | null = null
let candleSeries: any = null
let volumeSeries: any = null
let resizeObserver: ResizeObserver | null = null
const overlaySeries = new Map<string, any>()

const latestCandle = computed(() => props.candles.at(-1))

function time(value: number) {
  return Math.floor(value / 1000) as UTCTimestamp
}

function clearOverlaySeries() {
  overlaySeries.forEach((series) => {
    if (chart && series) {
      chart.removeSeries(series)
    }
  })
  overlaySeries.clear()
}

function createOverlay(id: string, color: string, lineWidth = 2, lineStyle = LineStyle.Solid) {
  if (!chart) {
    return null
  }

  const series = chart.addSeries(LineSeries, {
    color,
    lineWidth: lineWidth as any,
    lineStyle,
    crosshairMarkerVisible: false,
    lastValueVisible: false,
    priceLineVisible: false,
  })
  overlaySeries.set(id, series)
  return series
}

function mapNumericSeries(values: Array<number | null>) {
  return props.candles.flatMap((candle, index) => {
    const value = values[index]
    return value == null ? [] : [{ time: time(candle.time), value }]
  })
}

function drawOverlays() {
  clearOverlaySeries()
  if (!chart || !props.analysis?.series) {
    return
  }

  const overlayLines: Array<[string, string]> = [
    ['sma20', '#f59e0b'],
    ['sma50', '#06b6d4'],
    ['sma200', '#f43f5e'],
    ['ema9', '#10b981'],
    ['ema21', '#a855f7'],
    ['vwap', '#e879f9'],
    ['vwma20', '#38bdf8'],
  ]

  for (const [key, color] of overlayLines) {
    if (!props.enabledIndicators.includes(key)) {
      continue
    }

    const values = props.analysis.series[key]
    if (Array.isArray(values)) {
      const series = createOverlay(key, color)
      series?.setData(mapNumericSeries(values))
    }
  }

  if (props.enabledIndicators.includes('bollinger') && Array.isArray(props.analysis.series.bollinger)) {
    const upper = createOverlay('bollinger-upper', '#22d3ee', 1)
    const middle = createOverlay('bollinger-middle', '#c084fc', 1)
    const lower = createOverlay('bollinger-lower', '#22d3ee', 1)
    upper?.setData(
      props.candles.flatMap((candle, index) => {
        const row = props.analysis?.series?.bollinger?.[index]
        return row?.upper == null ? [] : [{ time: time(candle.time), value: row.upper }]
      }),
    )
    middle?.setData(
      props.candles.flatMap((candle, index) => {
        const row = props.analysis?.series?.bollinger?.[index]
        return row?.middle == null ? [] : [{ time: time(candle.time), value: row.middle }]
      }),
    )
    lower?.setData(
      props.candles.flatMap((candle, index) => {
        const row = props.analysis?.series?.bollinger?.[index]
        return row?.lower == null ? [] : [{ time: time(candle.time), value: row.lower }]
      }),
    )
  }

  if (props.enabledIndicators.includes('ichimoku') && Array.isArray(props.analysis.series.ichimoku)) {
    const conversion = createOverlay('ichimoku-conversion', '#fb7185', 1)
    const base = createOverlay('ichimoku-base', '#38bdf8', 1)
    const spanA = createOverlay('ichimoku-spanA', '#22c55e', 1, LineStyle.Dashed)
    const spanB = createOverlay('ichimoku-spanB', '#f97316', 1, LineStyle.Dashed)
    const source = props.analysis.series.ichimoku
    conversion?.setData(props.candles.flatMap((candle, index) => source[index]?.conversion == null ? [] : [{ time: time(candle.time), value: source[index].conversion }]))
    base?.setData(props.candles.flatMap((candle, index) => source[index]?.base == null ? [] : [{ time: time(candle.time), value: source[index].base }]))
    spanA?.setData(props.candles.flatMap((candle, index) => source[index]?.spanA == null ? [] : [{ time: time(candle.time), value: source[index].spanA }]))
    spanB?.setData(props.candles.flatMap((candle, index) => source[index]?.spanB == null ? [] : [{ time: time(candle.time), value: source[index].spanB }]))
  }

  if (props.enabledIndicators.includes('supertrend') && Array.isArray(props.analysis.series.supertrend)) {
    const supertrend = createOverlay('supertrend', '#22c55e', 2)
    supertrend?.setData(
      props.candles.flatMap((candle, index) => {
        const row = props.analysis?.series?.supertrend?.[index]
        return typeof row?.trend === 'number' ? [{ time: time(candle.time), value: row.trend }] : []
      }),
    )
  }
}

function syncTooltip(param: any) {
  if (!param?.point || !param?.time || !latestCandle.value) {
    tooltip.value.visible = false
    return
  }

  const data = param.seriesData.get(candleSeries)
  const volume = param.seriesData.get(volumeSeries)
  const labels = [
    `Mở ${formatPrice(data?.open, props.symbol.precision)}`,
    `Cao ${formatPrice(data?.high, props.symbol.precision)}`,
    `Thấp ${formatPrice(data?.low, props.symbol.precision)}`,
    `Đóng ${formatPrice(data?.close, props.symbol.precision)}`,
    `KL ${formatCompact(volume?.value)}`,
  ]
  if (props.enabledIndicators.includes('rsi')) {
    labels.push(`RSI ${formatPrice(props.analysis?.summaries?.rsi?.current, 2)}`)
  }
  if (props.enabledIndicators.includes('macd')) {
    labels.push(`MACD ${formatPrice(props.analysis?.summaries?.macd?.current, 2)}`)
  }
  if (props.enabledIndicators.includes('adx')) {
    labels.push(`ADX ${formatPrice(props.analysis?.summaries?.adx?.current, 2)}`)
  }

  tooltip.value = {
    visible: true,
    left: param.point.x + 12,
    top: 12,
    text: labels.join(' | '),
  }
}

function renderChart() {
  if (!chartSurface.value) {
    return
  }

  if (!chart) {
    chart = createChart(chartSurface.value, {
      layout: {
        background: { type: ColorType.Solid, color: '#020617' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: 'rgba(148, 163, 184, 0.1)' },
        horzLines: { color: 'rgba(148, 163, 184, 0.1)' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: 'rgba(148, 163, 184, 0.2)' },
      timeScale: { borderColor: 'rgba(148, 163, 184, 0.2)', timeVisible: true },
      width: chartSurface.value.clientWidth,
      height: 420,
    })
    candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
      borderVisible: false,
    })
    volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
      color: '#38bdf8',
    })
    chart.priceScale('').applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    })
    chart.subscribeCrosshairMove(syncTooltip)
  }

  candleSeries.setData(
    props.candles.map((item) => ({
      time: time(item.time),
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
    })),
  )
  volumeSeries.setData(
    props.candles.map((item) => ({
      time: time(item.time),
      value: item.volume,
      color: item.close >= item.open ? 'rgba(34, 197, 94, 0.45)' : 'rgba(239, 68, 68, 0.45)',
    })),
  )

  drawOverlays()
  chart.timeScale().fitContent()
  chart.timeScale().scrollToRealTime()
}

function enterFullscreen() {
  chartRoot.value?.requestFullscreen?.().catch(() => undefined)
}

function exportPng() {
  const canvas = chartSurface.value?.querySelector('canvas') as HTMLCanvasElement | null
  if (!canvas) {
    return
  }

  const link = document.createElement('a')
  link.href = canvas.toDataURL('image/png')
  link.download = `${props.symbol.id}-${props.timeframe}.png`
  link.click()
}

onMounted(async () => {
  await nextTick()
  renderChart()

  resizeObserver = new ResizeObserver(() => {
    if (chartSurface.value && chart) {
      chart.applyOptions({ width: chartSurface.value.clientWidth })
    }
  })
  if (chartSurface.value) {
    resizeObserver.observe(chartSurface.value)
  }
})

watch(
  () => [props.candles, props.analysis, props.enabledIndicators],
  () => {
    renderChart()
  },
  { deep: true },
)

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  clearOverlaySeries()
  chart?.remove()
})
</script>

<template>
  <section ref="chartRoot" class="rounded-[2rem] border border-slate-800 bg-slate-950/70 p-4 shadow-2xl shadow-slate-950/30">
    <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="text-xs uppercase tracking-[0.3em] text-slate-500">Biểu đồ giá</p>
        <h2 class="font-display text-lg text-slate-100">{{ symbol.label }}</h2>
        <p class="text-sm text-slate-500">{{ symbol.id }} · {{ timeframe }}</p>
      </div>
      <div class="flex gap-2">
        <button class="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-200" @click="enterFullscreen">
          Toàn màn hình
        </button>
        <button class="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-200" @click="exportPng">
          Xuất PNG
        </button>
      </div>
    </div>

    <div v-if="loading" class="mb-4 grid gap-3 md:grid-cols-4">
      <div v-for="item in 4" :key="item" class="h-16 animate-pulse rounded-2xl bg-slate-900/70" />
    </div>

    <div class="relative">
      <div ref="chartSurface" class="h-[420px] w-full overflow-hidden rounded-3xl border border-slate-800 bg-slate-950" />
      <div
        v-if="tooltip.visible"
        class="pointer-events-none absolute max-w-[90%] rounded-xl border border-slate-700 bg-slate-950/95 px-3 py-2 text-xs text-slate-200 shadow-xl"
        :style="{ left: `${tooltip.left}px`, top: `${tooltip.top}px` }"
      >
        {{ tooltip.text }}
      </div>
    </div>

    <div class="mt-4 grid gap-3 lg:grid-cols-4">
      <div class="rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
        <p class="text-xs uppercase tracking-[0.2em] text-slate-500">Khối lượng</p>
        <p class="mt-2 text-sm text-slate-200">{{ formatCompact(latestCandle?.volume) }}</p>
      </div>
      <div class="rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
        <p class="text-xs uppercase tracking-[0.2em] text-slate-500">RSI</p>
        <p class="mt-2 text-sm text-slate-200">{{ formatPrice(analysis?.summaries?.rsi?.current, 2) }}</p>
      </div>
      <div class="rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
        <p class="text-xs uppercase tracking-[0.2em] text-slate-500">MACD</p>
        <p class="mt-2 text-sm text-slate-200">{{ formatPrice(analysis?.summaries?.macd?.current, 2) }}</p>
      </div>
      <div class="rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
        <p class="text-xs uppercase tracking-[0.2em] text-slate-500">ADX</p>
        <p class="mt-2 text-sm text-slate-200">{{ formatPrice(analysis?.summaries?.adx?.current, 2) }}</p>
      </div>
    </div>
  </section>
</template>
