/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FINNHUB_KEY?: string
  readonly VITE_ALPHA_VANTAGE_KEY?: string
  readonly VITE_OPENAI_KEY?: string
  readonly VITE_OPENAI_MODEL?: string
  readonly VITE_THEME?: 'dark' | 'light'
  readonly VITE_MULTI_CHART_COUNT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
