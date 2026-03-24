import type { ServerOHLCV } from './market-data'
import { ensureTursoSchema, getTursoClient, isTursoConfigured } from './turso'

const UPSERT_CHUNK_SIZE = 100

function normalizeCandle(input: unknown) {
  const row = input as Record<string, unknown>
  const time = Number(row.time)
  const open = Number(row.open)
  const high = Number(row.high)
  const low = Number(row.low)
  const close = Number(row.close)
  const volume = Number(row.volume)

  return Number.isFinite(time) &&
    Number.isFinite(open) &&
    Number.isFinite(high) &&
    Number.isFinite(low) &&
    Number.isFinite(close) &&
    Number.isFinite(volume)
    ? { time, open, high, low, close, volume }
    : null
}

function normalizeCandles(input: unknown) {
  if (!Array.isArray(input)) {
    return []
  }

  return input
    .map(normalizeCandle)
    .filter((item): item is ServerOHLCV => item != null)
    .sort((a, b) => a.time - b.time)
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

export function isHistoryCacheConfigured() {
  return isTursoConfigured()
}

export async function readHistoryCache(symbol: string, timeframe: string, limit = 500) {
  await ensureTursoSchema()
  const db = getTursoClient()
  const result = await db.execute({
    sql: `SELECT ts, open, high, low, close, volume
      FROM candles
      WHERE symbol = ? AND timeframe = ?
      ORDER BY ts DESC
      LIMIT ?`,
    args: [symbol, timeframe, Math.max(1, Math.min(limit, 5000))],
  })

  return result.rows
    .map((row) => ({
      time: Number(row.ts),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume),
    }))
    .reverse()
}

export async function writeHistoryCache(
  symbol: string,
  timeframe: string,
  candles: unknown[],
  options: { assetCategory?: string; source?: string; error?: string } = {},
) {
  await ensureTursoSchema()
  const db = getTursoClient()
  const normalized = normalizeCandles(candles)
  const updatedAt = Date.now()

  for (const candlesChunk of chunk(normalized, UPSERT_CHUNK_SIZE)) {
    await db.batch(
      candlesChunk.map((candle) => ({
        sql: `INSERT INTO candles (
            symbol,
            timeframe,
            ts,
            open,
            high,
            low,
            close,
            volume,
            asset_category,
            source,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(symbol, timeframe, ts) DO UPDATE SET
            open = excluded.open,
            high = excluded.high,
            low = excluded.low,
            close = excluded.close,
            volume = excluded.volume,
            asset_category = COALESCE(excluded.asset_category, candles.asset_category),
            source = COALESCE(excluded.source, candles.source),
            updated_at = excluded.updated_at`,
        args: [
          symbol,
          timeframe,
          candle.time,
          candle.open,
          candle.high,
          candle.low,
          candle.close,
          candle.volume,
          options.assetCategory ?? null,
          options.source ?? null,
          updatedAt,
        ],
      })),
      'write',
    )
  }

  await db.execute({
    sql: `INSERT INTO history_sync_state (
        symbol,
        timeframe,
        asset_category,
        source,
        last_synced_at,
        last_candle_time,
        last_error
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(symbol, timeframe) DO UPDATE SET
        asset_category = excluded.asset_category,
        source = excluded.source,
        last_synced_at = excluded.last_synced_at,
        last_candle_time = excluded.last_candle_time,
        last_error = excluded.last_error`,
    args: [
      symbol,
      timeframe,
      options.assetCategory ?? null,
      options.source ?? null,
      updatedAt,
      normalized.at(-1)?.time ?? null,
      options.error ?? null,
    ],
  })

  return {
    ok: true,
    candles: normalized.length,
    lastCandleTime: normalized.at(-1)?.time ?? null,
  }
}
