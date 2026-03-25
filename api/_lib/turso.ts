import { createClient, type Client } from '@libsql/client'

declare global {
  var __tursoClient__: Client | undefined
  var __tursoSchemaReady__: Promise<void> | undefined
}

type TursoConfig = {
  url: string
  authToken?: string
}

function readEnv(name: 'TURSO_DATABASE_URL' | 'TURSO_AUTH_TOKEN') {
  return process.env[name]?.trim()
}

function getTursoConfig(): TursoConfig {
  const url = readEnv('TURSO_DATABASE_URL')
  if (!url) {
    throw new Error('Missing server env TURSO_DATABASE_URL')
  }

  const authToken = readEnv('TURSO_AUTH_TOKEN')
  if (!authToken && !url.startsWith('file:')) {
    throw new Error('Missing server env TURSO_AUTH_TOKEN')
  }

  return { url, authToken }
}

export function isTursoConfigured() {
  const url = readEnv('TURSO_DATABASE_URL')
  if (!url) {
    return false
  }

  return url.startsWith('file:') || Boolean(readEnv('TURSO_AUTH_TOKEN'))
}

export function getTursoClient() {
  if (!globalThis.__tursoClient__) {
    const config = getTursoConfig()
    globalThis.__tursoClient__ = createClient({
      url: config.url,
      authToken: config.authToken,
      concurrency: 8,
    })
  }

  return globalThis.__tursoClient__
}

export async function ensureTursoSchema() {
  if (globalThis.__tursoSchemaReady__) {
    return globalThis.__tursoSchemaReady__
  }

  globalThis.__tursoSchemaReady__ = (async () => {
    const db = getTursoClient()
    await db.batch(
      [
        {
          sql: `CREATE TABLE IF NOT EXISTS candles (
            symbol TEXT NOT NULL,
            timeframe TEXT NOT NULL,
            ts INTEGER NOT NULL,
            open REAL NOT NULL,
            high REAL NOT NULL,
            low REAL NOT NULL,
            close REAL NOT NULL,
            volume REAL NOT NULL,
            asset_category TEXT,
            source TEXT,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (symbol, timeframe, ts)
          ) WITHOUT ROWID`,
        },
        {
          sql: `CREATE INDEX IF NOT EXISTS idx_candles_symbol_timeframe_ts_desc
            ON candles (symbol, timeframe, ts DESC)`,
        },
        {
          sql: `CREATE INDEX IF NOT EXISTS idx_candles_category_timeframe_ts_desc
            ON candles (asset_category, timeframe, ts DESC)`,
        },
        {
          sql: `CREATE TABLE IF NOT EXISTS history_sync_state (
            symbol TEXT NOT NULL,
            timeframe TEXT NOT NULL,
            asset_category TEXT,
            source TEXT,
            last_synced_at INTEGER NOT NULL,
            last_candle_time INTEGER,
            last_error TEXT,
            PRIMARY KEY (symbol, timeframe)
          ) WITHOUT ROWID`,
        },
      ],
      'write',
    )
  })().catch((error) => {
    globalThis.__tursoSchemaReady__ = undefined
    throw error
  })

  return globalThis.__tursoSchemaReady__
}
