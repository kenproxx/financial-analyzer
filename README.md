# Financial Analyzer Frontend

Ung dung web local bang Vue 3 + Vite + Pinia + TailwindCSS de theo doi gia realtime, chart nen, phan tich ky thuat va AI insight.

## Chay local

```powershell
cd D:\Projects\financial-analyzer
copy .env.example .env
npm install
npm run dev
```

Dev server mac dinh: `http://127.0.0.1:5173`

## Env

```env
VITE_FINNHUB_KEY=
VITE_ALPHA_VANTAGE_KEY=
VITE_OPENAI_MODEL=gpt-4o
VITE_THEME=dark
VITE_MULTI_CHART_COUNT=2

OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o
TURSO_DATABASE_URL=
TURSO_AUTH_TOKEN=

CRON_SECRET=
SYNC_SYMBOLS=BTCUSD,ETHUSD,XAUUSD,EURUSD,VCB,HPG
SYNC_TIMEFRAMES=15m,1h,4h,1D
```

Gia tri trong `.env` la mac dinh ban dau. Neu site da co `localStorage`, settings da luu se override env.

## OpenAI Proxy

Khong nen rewrite `/api/openai/*` thang sang `https://api.openai.com/*` trong `vercel.json`, va cung khong nen dua OpenAI API key vao `VITE_*` env de frontend gui `Authorization` truc tiep tu browser.

Repo nay da dung serverless route:

- `POST /api/openai/v1/chat/completions`

Route nay doc key tu:

- `OPENAI_API_KEY`
- `OPENAI_MODEL` (optional fallback)

Frontend chi goi endpoint noi bo cua app. Key khong xuat hien trong browser network payload.

## Turso History Cache

App da bo Google Sheets va chuyen sang Turso de luu cache lich su OHLCV.

Cach dung dung cho repo nay khi deploy tren Vercel:

```ts
// api/_lib/turso.ts
import { createClient } from '@libsql/client'

let client: ReturnType<typeof createClient> | undefined
let schemaReady: Promise<void> | undefined

function getDb() {
  if (!client) {
    client = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN!,
    })
  }

  return client
}

export async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = getDb().batch(
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
            PRIMARY KEY (symbol, timeframe, ts)
          ) WITHOUT ROWID`,
        },
      ],
      'write',
    )
  }

  return schemaReady
}
```

Khong nen tao table truc tiep trong tung request theo kieu `CREATE TABLE todos ...` vi request thu hai tro di se loi neu table da ton tai, va schema init khong nen nam trong frontend.

Thanh phan chinh:

- Client cache helper: [src/utils/historyCache.ts](D:/Projects/financial-analyzer/src/utils/historyCache.ts)
- Vercel / dev API route: [api/history-cache.ts](D:/Projects/financial-analyzer/api/history-cache.ts)
- Turso server helper: [api/_lib/history-cache.ts](D:/Projects/financial-analyzer/api/_lib/history-cache.ts)
- Schema: [db/turso-schema.sql](D:/Projects/financial-analyzer/db/turso-schema.sql)

Schema toi uu cho workload hien tai:

- Kho chinh `(symbol, timeframe, ts)` de luu nhieu khung thoi gian va nhieu loai tai san.
- Index `symbol + timeframe + ts DESC` de doc nhanh 300-500 nen gan nhat cho chart va AI.
- Cot `asset_category` de mo rong query theo nhom tai san trong tuong lai.
- Bang `history_sync_state` de theo doi lan sync cuoi cho tung symbol/timeframe.

## Deploy Vercel

Can dat cac Environment Variables trong Vercel:

- `OPENAI_API_KEY`
- `OPENAI_MODEL=gpt-4o`
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `CRON_SECRET`
- `SYNC_SYMBOLS=BTCUSD,ETHUSD,XAUUSD,EURUSD,VCB,HPG`
- `SYNC_TIMEFRAMES=15m,1h,4h,1D`

Neu dung Alpha Vantage cho fallback trong cron:

- `ALPHA_VANTAGE_KEY=<your-key>`

Route quan trong:

- `GET /api/history-cache?symbol=BTCUSD&timeframe=1h&limit=500`
- `POST /api/history-cache`
- `GET /api/sync-history?secret=<CRON_SECRET>`

Cron mac dinh trong [vercel.json](D:/Projects/financial-analyzer/vercel.json) la `0 1 * * *`.

## Build

```powershell
npm run build
```
