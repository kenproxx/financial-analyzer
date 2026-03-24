CREATE TABLE IF NOT EXISTS candles (
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
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_candles_symbol_timeframe_ts_desc
  ON candles (symbol, timeframe, ts DESC);

CREATE INDEX IF NOT EXISTS idx_candles_category_timeframe_ts_desc
  ON candles (asset_category, timeframe, ts DESC);

CREATE TABLE IF NOT EXISTS history_sync_state (
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  asset_category TEXT,
  source TEXT,
  last_synced_at INTEGER NOT NULL,
  last_candle_time INTEGER,
  last_error TEXT,
  PRIMARY KEY (symbol, timeframe)
) WITHOUT ROWID;
