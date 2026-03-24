import { createClient, type Client } from '@libsql/client'

let client: Client | null = null
let schemaReady: Promise<void> | null = null

function getRequiredEnv(name: 'TURSO_DATABASE_URL' | 'TURSO_AUTH_TOKEN') {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing server env ${name}`)
  }
  return value
}

export function isTursoConfigured() {
  return Boolean(process.env.TURSO_DATABASE_URL?.trim() && process.env.TURSO_AUTH_TOKEN?.trim())
}

export function getTursoClient() {
  if (!client) {
    client = createClient({
      url: getRequiredEnv('TURSO_DATABASE_URL'),
      authToken: getRequiredEnv('TURSO_AUTH_TOKEN'),
      concurrency: 8,
    })
  }

  return client
}

export async function ensureTursoSchema() {
  if (schemaReady) {
    return schemaReady
  }

  schemaReady = (async () => {
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
    schemaReady = null
    throw error
  })

  return schemaReady
}
