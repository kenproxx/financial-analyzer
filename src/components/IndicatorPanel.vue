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
  preset: [preset: 'scalping' | 'swing' | 'longTerm']
}>()

const groups = computed(() => ['trend', 'momentum', 'volatility', 'volume', 'pattern', 'support', 'advanced'] as IndicatorGroup[])
</script>

<template>
  <section class="rounded-3xl border border-slate-800 bg-slate-950/70 p-4 shadow-2xl shadow-slate-950/30">
    <div class="mb-4">
      <p class="text-xs uppercase tracking-[0.3em] text-slate-500">Indicator Filter</p>
      <h2 class="font-display text-lg text-slate-100">Bộ lọc chỉ báo</h2>
    </div>

    <div class="mb-4 flex flex-wrap gap-2">
      <button class="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:border-emerald-400" @click="emit('preset', 'scalping')">
        Scalping
      </button>
      <button class="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:border-emerald-400" @click="emit('preset', 'swing')">
        Swing
      </button>
      <button class="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:border-emerald-400" @click="emit('preset', 'longTerm')">
        Long-term
      </button>
    </div>

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
        <span class="capitalize">{{ group }}</span>
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
          <p class="text-xs capitalize text-slate-500">{{ indicator.group }}</p>
        </div>
        <input
          :checked="props.enabledIndicators.includes(indicator.key)"
          class="accent-emerald-400"
          type="checkbox"
          @change="emit('toggleIndicator', indicator.key)"
        />
      </label>
    </div>
  </section>
</template>
