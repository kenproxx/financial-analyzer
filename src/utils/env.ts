function asNumber<T extends number>(value: string | undefined, fallback: T) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? (parsed as T) : fallback
}

export const APP_ENV = {
  finnhubKey: import.meta.env.VITE_FINNHUB_KEY?.trim() ?? '',
  alphaVantageKey: import.meta.env.VITE_ALPHA_VANTAGE_KEY?.trim() ?? '',
  openAiKey: import.meta.env.VITE_OPENAI_KEY?.trim() ?? '',
  openAiModel: import.meta.env.VITE_OPENAI_MODEL?.trim() || 'gpt-4o',
  theme: import.meta.env.VITE_THEME === 'light' ? 'light' : 'dark',
  multiChartCount: asNumber<1 | 2 | 4>(import.meta.env.VITE_MULTI_CHART_COUNT, 2),
} as const
