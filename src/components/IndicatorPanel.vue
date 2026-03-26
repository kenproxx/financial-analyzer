<script setup lang="ts">
import { computed } from 'vue'
import { INDICATORS } from '../constants/markets'
import type { IndicatorGroup } from '../types/market'

const props = defineProps<{
  enabledIndicators: string[]
  enabledGroups: Record<IndicatorGroup, boolean>
}>()

const emit = defineEmits<{
  toggleIndicator: [key: string]
  toggleGroup: [group: IndicatorGroup]
  toggleAll: [enabled: boolean]
  preset: [preset: 'scalping' | 'swing' | 'longTerm']
}>()

const groups = computed(() => ['trend', 'momentum', 'volatility', 'volume', 'pattern', 'support', 'advanced'] as IndicatorGroup[])
const allSelected = computed(
  () => groups.value.every((group) => props.enabledGroups[group]) && INDICATORS.every((item) => props.enabledIndicators.includes(item.key)),
)

function groupLabel(group: IndicatorGroup) {
  switch (group) {
    case 'trend':
      return 'Xu hướng'
    case 'momentum':
      return 'Động lượng'
    case 'volatility':
      return 'Biến động'
    case 'volume':
      return 'Khối lượng'
    case 'pattern':
      return 'Mô hình'
    case 'support':
      return 'Hỗ trợ/kháng cự'
    case 'advanced':
      return 'Nâng cao'
  }
}
</script>

<template>
  <section class="rounded-3xl border border-slate-800 bg-slate-950/70 p-4 shadow-2xl shadow-slate-950/30">
    <div class="mb-4">
      <p class="text-xs uppercase tracking-[0.3em] text-slate-500">Bộ lọc chỉ báo</p>
      <h2 class="font-display text-lg text-slate-100">Tùy chọn chỉ báo kỹ thuật</h2>
    </div>

    <div class="mb-4 flex flex-wrap gap-2">
      <button class="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:border-emerald-400" @click="emit('preset', 'scalping')">
        Lướt sóng
      </button>
      <button class="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:border-emerald-400" @click="emit('preset', 'swing')">
        Swing
      </button>
      <button class="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:border-emerald-400" @click="emit('preset', 'longTerm')">
        Dài hạn
      </button>
    </div>

    <label class="mb-4 flex items-center justify-between rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
      <span>Chọn toàn bộ chỉ báo</span>
      <input
        :checked="allSelected"
        class="accent-emerald-400"
        type="checkbox"
        @change="emit('toggleAll', ($event.target as HTMLInputElement).checked)"
      />
    </label>

    <div class="mb-4 grid gap-2 sm:grid-cols-2">
      <label
        v-for="group in groups"
        :key="group"
        class="flex items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/50 px-3 py-2 text-sm text-slate-200"
      >
        <input
          :checked="enabledGroups[group]"
          class="accent-emerald-400"
          type="checkbox"
          @change="emit('toggleGroup', group)"
        />
        <span>{{ groupLabel(group) }}</span>
      </label>
    </div>

    <div class="grid max-h-[34rem] gap-2 overflow-auto pr-1">
      <label
        v-for="indicator in INDICATORS"
        :key="indicator.key"
        class="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm"
      >
        <div class="min-w-0">
          <p class="truncate text-slate-100">{{ indicator.label }}</p>
          <p class="text-xs text-slate-500">{{ groupLabel(indicator.group) }}</p>
        </div>
        <input
          :checked="props.enabledGroups[indicator.group] && props.enabledIndicators.includes(indicator.key)"
          class="accent-emerald-400"
          type="checkbox"
          @change="emit('toggleIndicator', indicator.key)"
        />
      </label>
    </div>
  </section>
</template>
