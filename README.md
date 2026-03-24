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
VITE_GOOGLE_SHEETS_WEB_APP_URL=
VITE_GOOGLE_SHEETS_SECRET=
```

Gia tri trong `.env` la mac dinh ban dau. Neu site da co `localStorage`, settings da luu se override env.

## Google Sheets Cache

App quay lai co che cu: dung Google Apps Script Web App de doc va ghi history OHLCV.

Thiet lap:

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

## Build

```powershell
npm run build
```
