<script setup lang="ts">
import type { SupportedTimeframe } from '../types/market'

defineProps<{
  modelValue: SupportedTimeframe
  options: SupportedTimeframe[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: SupportedTimeframe]
}>()
</script>

<template>
  <div class="flex flex-wrap gap-2">
    <button
      v-for="timeframe in options"
      :key="timeframe"
      class="rounded-full border px-3 py-1.5 text-sm transition"
      :class="
        timeframe === modelValue
          ? 'border-emerald-400 bg-emerald-500/20 text-emerald-100'
          : 'border-slate-700 bg-slate-900/40 text-slate-300 hover:border-slate-500'
      "
      @click="emit('update:modelValue', timeframe)"
    >
      {{ timeframe }}
    </button>
  </div>
</template>
