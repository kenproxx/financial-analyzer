import type { SignalStrength } from '../types/market'

export function formatPrice(value: number | null | undefined, precision = 2) {
  if (value == null || Number.isNaN(value)) {
    return '--'
  }

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  }).format(value)
}

export function formatCompact(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) {
    return '--'
  }

  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatPercent(value: number | null | undefined, digits = 2) {
  if (value == null || Number.isNaN(value)) {
    return '--'
  }

  return `${value.toFixed(digits)}%`
}

export function signalLabel(strength: SignalStrength) {
  switch (strength) {
    case 'strongBuy':
      return 'MUA MẠNH'
    case 'buy':
      return 'MUA'
    case 'sell':
      return 'BÁN'
    case 'strongSell':
      return 'BÁN MẠNH'
    default:
      return 'TRUNG LẬP'
  }
}

export function signalGlyph(strength: SignalStrength) {
  switch (strength) {
    case 'strongBuy':
      return '▲▲'
    case 'buy':
      return '▲'
    case 'sell':
      return '▼'
    case 'strongSell':
      return '▼▼'
    default:
      return '—'
  }
}
