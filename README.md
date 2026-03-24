# Financial Analyzer Frontend

Ung dung web local bang Vue 3 + Vite + Pinia + TailwindCSS de theo doi gia realtime, chart nen va phan tich ky thuat.

## Chay local

```powershell
cd D:\Projects\financial-analyzer\frontend
copy .env.example .env
npm install
npm run dev
```

Dev server mac dinh: `http://127.0.0.1:5173`

## Env

```env
VITE_FINNHUB_KEY=
VITE_ALPHA_VANTAGE_KEY=
VITE_OPENAI_KEY=
VITE_OPENAI_MODEL=gpt-4o
VITE_THEME=dark
VITE_MULTI_CHART_COUNT=2

VITE_GOOGLE_SHEETS_ENABLED=false
# Chi can cho local dev proxy bang Vite:
VITE_GOOGLE_SHEETS_WEB_APP_URL=
VITE_GOOGLE_SHEETS_SECRET=

# Chi can tren Vercel Functions / server-side:
GOOGLE_SHEETS_WEB_APP_URL=
GOOGLE_SHEETS_SECRET=
CRON_SECRET=
SYNC_SYMBOLS=BTCUSD,ETHUSD,XAUUSD,EURUSD,VCB,HPG
SYNC_TIMEFRAMES=15m,1h,4h,1D
```

Gia tri trong `.env` la mac dinh ban dau. Neu site da co `localStorage`, settings da luu se override env.

## Google Sheets Cache

App quay lai co che cu: dung Google Apps Script Web App de doc va ghi history OHLCV.

Thiet lap local:

```env
VITE_GOOGLE_SHEETS_ENABLED=true
VITE_GOOGLE_SHEETS_WEB_APP_URL=<web-app-url>
VITE_GOOGLE_SHEETS_SECRET=<your-secret>
```

Contract:

- `GET {WEB_APP_URL}?action=history&symbol=BTCUSD&timeframe=1h&limit=500&secret=...`
- `POST {WEB_APP_URL}` voi body JSON:

```json
{
  "action": "upsertHistory",
  "secret": "your-secret",
  "symbol": "BTCUSD",
  "timeframe": "1h",
  "candles": [
    {
      "time": 1710000000000,
      "open": 62000,
      "high": 62500,
      "low": 61800,
      "close": 62400,
      "volume": 123.45
    }
  ]
}
```

File Apps Script mau:

- [google-apps-script/Code.gs.example](D:/Projects/financial-analyzer/frontend/google-apps-script/Code.gs.example)

Trien khai nhanh:

1. Tao Google Sheet moi.
2. Mo `Extensions -> Apps Script`.
3. Dan noi dung tu `Code.gs.example`.
4. Trong `Project Settings`, them `Script property` ten `APP_SECRET`.
5. Deploy duoi dang `Web app`, `Execute as: Me`, `Who has access: Anyone`.
6. Dien `VITE_GOOGLE_SHEETS_ENABLED=true`.
7. Dien `VITE_GOOGLE_SHEETS_WEB_APP_URL=<web-app-url>`.
8. Dien `VITE_GOOGLE_SHEETS_SECRET=<same-secret>`.

Luu y:

- Khi chay local bang `npm run dev`, app se goi Google Apps Script qua proxy `/api/sheets-cache` cua Vite de tranh loi CORS.
- Neu ban vua doi `VITE_GOOGLE_SHEETS_WEB_APP_URL`, hay restart lai dev server de proxy nap URL moi.

## Deploy Vercel

App da duoc them:

- Vercel Function: [api/sheets-cache.ts](D:/Projects/financial-analyzer/frontend/api/sheets-cache.ts)
- Vercel Cron worker: [api/sync-history.ts](D:/Projects/financial-analyzer/frontend/api/sync-history.ts)
- Rewrite config: [vercel.json](D:/Projects/financial-analyzer/frontend/vercel.json)

Can dat cac Environment Variables trong Vercel:

- `VITE_GOOGLE_SHEETS_ENABLED=true`
- `GOOGLE_SHEETS_WEB_APP_URL=<web-app-url>`
- `GOOGLE_SHEETS_SECRET=<app-secret>`
- `CRON_SECRET=<random-secret>`
- `SYNC_SYMBOLS=BTCUSD,ETHUSD,XAUUSD,EURUSD,VCB,HPG`
- `SYNC_TIMEFRAMES=15m,1h,4h,1D`

Neu dung Alpha Vantage cho fallback trong cron:

- `ALPHA_VANTAGE_KEY=<your-key>`

Ghi chu:

- Client production tren Vercel se doc/ghi sheet qua `/api/sheets-cache`, khong goi truc tiep Apps Script.
- Cron mac dinh trong [vercel.json](D:/Projects/financial-analyzer/frontend/vercel.json) la `0 1 * * *` de tuong thich Hobby. Neu ban dung Pro, co the tang tan suat.
- Ban co the goi tay worker bang `GET /api/sync-history?secret=<CRON_SECRET>`.

## Build

```powershell
npm run build
```
