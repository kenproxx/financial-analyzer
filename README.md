# Financial Analyzer

Bảng điều khiển phân tích tài chính thời gian thực xây bằng **Vue 3 + Vite + Pinia + TailwindCSS**, có hỗ trợ **chart nến**, **indicator kỹ thuật**, **AI insight**, và **history cache bằng Turso**.

Repo này hiện phù hợp nhất với 3 mục tiêu:
- làm **portfolio project** cho frontend/backend-lite
- dùng như một **internal trading dashboard / market monitor**
- làm nền tảng để phát triển tiếp thành một **MVP public**

## Tính năng chính

- Theo dõi nhiều nhóm tài sản: crypto, forex, vàng, chỉ số, cổ phiếu Việt Nam
- Dữ liệu realtime qua **Binance WebSocket** và **Finnhub WebSocket**
- Fallback quote/history qua Yahoo và Alpha Vantage
- Multi-chart layout: 1 / 2 / 4 biểu đồ
- Chọn nhiều khung thời gian
- Technical analysis với nhiều indicator
- Signal aggregation: buy / sell / neutral / strongBuy / strongSell
- AI insight qua server-side OpenAI proxy
- Cache lịch sử OHLCV vào **Turso** để giảm tải API ngoài
- Sync lịch sử theo cron qua Vercel

## Kiến trúc tổng quan

### Frontend
- `src/App.vue`: orchestration chính của dashboard
- `src/components/*`: UI panels, chart, watchlist, AI insight
- `src/stores/*`: state với Pinia
- `src/composables/*`: signal engine, websocket, technical analysis
- `src/utils/*`: market data, formatting, cache helpers, storage
- `src/workers/*`: worker cho indicator computation

### Serverless API
- `api/openai/v1/chat/completions.ts`: proxy OpenAI để không lộ API key ở browser
- `api/history-cache.ts`: đọc/ghi cache OHLCV
- `api/sync-history.ts`: endpoint cron để đồng bộ lịch sử
- `api/_lib/*`: helper cho Turso, market config, market sync

### Data flow ngắn gọn
1. Frontend lấy quote/history từ source phù hợp (Binance/Finnhub/Yahoo/Alpha)
2. Dữ liệu lịch sử được cache vào Turso qua `api/history-cache`
3. Indicator engine tính toán signal từ candles
4. AI panel đọc quote + analysis rồi gọi OpenAI proxy nội bộ
5. Cron `/api/sync-history` có thể chủ động làm nóng cache định kỳ

## Cấu trúc thư mục

```text
financial-analyzer/
├─ api/
├─ db/
├─ public/
├─ src/
├─ .env.example
├─ README.md
├─ vercel.json
└─ package.json
```

## Chạy local

```powershell
cd D:\financial-analyzer
copy .env.example .env
npm install
npm run dev
```

Dev server mặc định:
- `http://127.0.0.1:5173`

## Environment variables

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

Giá trị trong `.env` là mặc định ban đầu. Nếu app đã có `localStorage`, settings đã lưu có thể override một phần cấu hình frontend.

## Build và test

### Production build

```powershell
npm run build
```

### Test

```powershell
npm run test
```

Hiện repo có test nền tảng cho:
- signal aggregation logic
- market data helper logic

## OpenAI Proxy

Không nên đưa OpenAI API key vào `VITE_*` env hoặc gọi OpenAI trực tiếp từ browser.

Repo này dùng route nội bộ:
- `POST /api/openai/v1/chat/completions`

Route này đọc key từ:
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (fallback)

## Turso History Cache

App đã chuyển sang Turso để lưu cache lịch sử OHLCV.

Thành phần chính:
- Client cache helper: `src/utils/historyCache.ts`
- Vercel / dev API route: `api/history-cache.ts`
- Turso server helper: `api/_lib/history-cache.ts`
- Schema: `db/turso-schema.sql`

Thiết kế hiện tại phù hợp với workload chart:
- khóa chính `(symbol, timeframe, ts)`
- đọc nhanh 300-500 candles gần nhất
- hỗ trợ mở rộng theo `asset_category`
- theo dõi sync state riêng cho từng symbol/timeframe

## Deploy lên Vercel

Cần set các biến môi trường:
- `OPENAI_API_KEY`
- `OPENAI_MODEL=gpt-4o`
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `CRON_SECRET`
- `SYNC_SYMBOLS=BTCUSD,ETHUSD,XAUUSD,EURUSD,VCB,HPG`
- `SYNC_TIMEFRAMES=15m,1h,4h,1D`

Nếu dùng Alpha Vantage fallback trong cron:
- `ALPHA_VANTAGE_KEY=<your-key>`

Routes chính:
- `GET /api/history-cache?symbol=BTCUSD&timeframe=1h&limit=500`
- `POST /api/history-cache`
- `GET /api/sync-history?secret=<CRON_SECRET>`

Cron mặc định trong `vercel.json`:
- `0 1 * * *`

## Điểm mạnh hiện tại

- Build pass ổn định
- Cấu trúc repo khá rõ
- Có server-side proxy cho OpenAI
- Có Turso cache thực tế, không chỉ mock/demo
- Có fallback nhiều nguồn dữ liệu
- Có thể dùng như late MVP khá tốt

## Giới hạn hiện tại

- Chưa có auth / multi-user
- Chưa có test coverage rộng
- Chưa có monitoring / observability đầy đủ
- Orchestration trong `App.vue` vẫn còn khá nặng
- Chưa harden đầy đủ cho production public traffic lớn

## Roadmap đề xuất

### Ngắn hạn
- tăng test coverage cho stores và API helpers
- tách bớt orchestration khỏi `App.vue`
- thêm validation chặt hơn cho API routes
- thêm screenshot/GIF demo vào README

### Trung hạn
- thêm auth và user settings server-side
- thêm rate limiting cho OpenAI/cache/sync routes
- thêm error reporting và monitoring
- thêm watchlist persistence phía server

### Dài hạn
- portfolio tracking / PnL
- alert engine nâng cao
- strategy backtesting
- multi-user workspace

## Gợi ý demo / screenshot

Nếu bạn muốn repo này nhìn mạnh hơn trên GitHub, nên thêm:
- 1 ảnh dashboard tổng quan
- 1 ảnh AI insight panel
- 1 ảnh multi-chart mode
- 1 GIF ngắn cho realtime flow

### Placeholder đề xuất cho README

```md
![Dashboard overview](./docs/screenshots/dashboard-overview.png)
![AI insight panel](./docs/screenshots/ai-insight.png)
![Multi-chart mode](./docs/screenshots/multi-chart.png)
```

## Các cải tiến gần đây

- thêm nền tảng test với Vitest
- thêm test cho signal engine, market data helpers và baseline verification cho nhóm indicator cốt lõi
- tách logic realtime/sync orchestration khỏi `App.vue` sang composable riêng
- tăng validation cho các API route quan trọng
- bổ sung tài liệu audit cho technical indicator correctness
- chuẩn hóa README để repo portfolio-friendly hơn

## Technical analysis correctness

Vì đây là ứng dụng liên quan tới tài chính, repo hiện đã bắt đầu có hướng kiểm định rõ hơn cho phần indicator:
- audit nguồn công thức trong `docs/indicator-audit.md`
- baseline verification test cho các indicator cốt lõi trong `src/utils/indicators.core.test.ts`
- verification bổ sung cho một số công thức custom/high-risk trong `src/utils/indicators.advanced.test.ts`
- wave verification tiếp theo cho Aroon / CMO / Historical Volatility / Ultimate Oscillator và một phần signal rules trong `src/utils/indicators.audit-wave3.test.ts`

Lưu ý quan trọng: để tuyên bố “100% chính xác” theo chuẩn nghiêm ngặt, vẫn cần tiếp tục mở rộng verification coverage cho các phần còn lại như Supertrend canonical reference bên ngoài. Signal aggregation hiện đã có coverage tốt hơn nhiều, nhưng vẫn nên tiếp tục mở rộng nếu thêm indicator/rule mới.

## License / mục đích sử dụng

Hiện README chưa chốt license cụ thể. Nếu định public nghiêm túc, nên thêm license rõ ràng.
