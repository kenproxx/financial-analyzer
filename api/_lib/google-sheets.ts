const UNAUTHORIZED_MESSAGE = 'Google Sheets Web App is not publicly accessible. Deploy it as Execute as: Me, Who has access: Anyone.'

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing server env ${name}`)
  }
  return value
}

export function isSheetsCacheConfigured() {
  return Boolean(process.env.GOOGLE_SHEETS_WEB_APP_URL?.trim())
}

async function parseJsonResponse(response: Response, operation: 'read' | 'write') {
  const contentType = response.headers.get('content-type') || ''
  if (
    response.status === 401 ||
    response.status === 403 ||
    response.url.includes('accounts.google.com') ||
    contentType.includes('text/html')
  ) {
    throw new Error(UNAUTHORIZED_MESSAGE)
  }

  if (!response.ok) {
    throw new Error(`Google Sheets ${operation} failed (${response.status})`)
  }

  if (!contentType.includes('application/json')) {
    throw new Error(`Google Sheets ${operation} returned non-JSON content`)
  }

  return response.json()
}

export async function readSheetHistory(symbol: string, timeframe: string, limit = 500) {
  const url = new URL(getRequiredEnv('GOOGLE_SHEETS_WEB_APP_URL'))
  url.searchParams.set('action', 'history')
  url.searchParams.set('symbol', symbol)
  url.searchParams.set('timeframe', timeframe)
  url.searchParams.set('limit', String(limit))
  const secret = process.env.GOOGLE_SHEETS_SECRET?.trim()
  if (secret) {
    url.searchParams.set('secret', secret)
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })

  return parseJsonResponse(response, 'read')
}

export async function writeSheetHistory(symbol: string, timeframe: string, candles: unknown[]) {
  const response = await fetch(getRequiredEnv('GOOGLE_SHEETS_WEB_APP_URL'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      action: 'upsertHistory',
      symbol,
      timeframe,
      candles,
      secret: process.env.GOOGLE_SHEETS_SECRET?.trim() || undefined,
    }),
  })

  return parseJsonResponse(response, 'write')
}
