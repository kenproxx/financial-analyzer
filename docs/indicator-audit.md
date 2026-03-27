# Technical Indicator Audit

## Mục tiêu

Tài liệu này ghi lại nguồn công thức, mức độ tin cậy, và rủi ro sai số của hệ thống indicator hiện tại trong repo `financial-analyzer`.

Đây là bước bắt buộc nếu muốn tiến tới chuẩn **financial-grade correctness** thay vì chỉ “có vẻ đúng”.

## Nguyên tắc kiểm định

Để một indicator được coi là đáng tin, cần chốt đủ 4 yếu tố:
1. **Source of truth**: công thức / thư viện / tài liệu tham chiếu
2. **Warmup semantics**: cần bao nhiêu nến trước khi kết quả hợp lệ
3. **Smoothing / seeding**: ví dụ EMA seed, Wilder smoothing, rolling window
4. **Verification**: test fixture hoặc đối chiếu với implementation tham chiếu

## Hiện trạng engine

Phần lớn indicator hiện dùng thư viện `technicalindicators`.

### Các indicator đang phụ thuộc chủ yếu vào `technicalindicators`
- SMA
- EMA
- WMA
- RSI
- MACD
- ATR
- ADX
- Bollinger Bands
- CCI
- Ichimoku Cloud
- MFI
- OBV
- PSAR
- ROC
- SD
- Stochastic
- Stochastic RSI
- TRIX
- VWAP
- Williams %R
- keltnerchannels
- pattern helpers (`doji`, `hammerpattern`, `shootingstar`, `bullishengulfingpattern`, `bearishengulfingpattern`)

### Các indicator/custom logic tự cài đặt
- DEMA
- TEMA
- HMA
- Momentum
- Historical Volatility
- CMF
- Volume SMA wrapper
- VWMA
- Donchian Channel
- Ultimate Oscillator
- Pivot Points
- Fibonacci retracement summary
- Supertrend
- Aroon oscillator
- CMO
- Elder Ray
- DPO
- Guppy MMA summary
- Pattern fallback / manual hammer & shooting star heuristics
- Signal aggregation (buy/sell/neutral)

## Phân loại rủi ro

### Mức rủi ro thấp
Những indicator này tương đối chuẩn nếu input OHLCV đúng và thư viện tham chiếu ổn định:
- SMA
- EMA
- WMA
- RSI
- MACD
- ATR
- ADX
- Bollinger Bands
- CCI
- MFI
- OBV
- ROC
- Stochastic
- Stochastic RSI
- TRIX
- Williams %R

### Mức rủi ro trung bình
Các indicator này đúng ý tưởng nhưng dễ lệch theo seeding, windowing hoặc interpretation:
- VWAP
- Ichimoku
- PSAR
- Keltner
- Historical Volatility
- Ultimate Oscillator
- Elder Ray
- CMO
- Donchian
- Guppy summary

### Mức rủi ro cao
Các indicator / logic này cần audit sâu hơn vì là custom hoặc có nhiều biến thể ngoài thực tế:
- Supertrend
- HMA
- DEMA
- TEMA
- DPO
- CMF
- pattern detection fallback heuristics
- signal aggregation rules
- summary formatting dùng để feed sang AI insight

## Nhận định hiện tại

### Điểm mạnh
- Engine đã có separation rõ: `indicatorWorker` -> `calculateIndicatorSet` -> `buildSignals`
- Nhiều indicator cốt lõi đang bám vào thư viện phổ biến thay vì tự viết toàn bộ
- Output structure đã khá thống nhất (`series`, `summaries`, `signals`, `aggregate`)

### Điểm yếu
- Chưa có baseline verification cho từng indicator cốt lõi
- Chưa có golden dataset / fixture chuẩn
- Chưa chốt tài liệu tham chiếu cho từng công thức
- Một số indicator custom chưa được chứng minh bằng test đối chiếu
- Signal layer hiện là rule-based heuristic, chưa có tài liệu formal cho financial correctness

## Đề xuất chiến lược correctness

### Wave 1 — Core indicator verification
Ưu tiên audit + test chính xác cho:
- SMA
- EMA
- RSI
- MACD
- ATR
- ADX
- Bollinger Bands
- Stochastic

### Wave 2 — Secondary / advanced
- Ichimoku
- VWAP
- MFI
- CCI
- Williams %R
- OBV
- ROC
- TRIX
- Keltner

### Wave 3 — Custom / high-risk
- DEMA
- TEMA
- HMA
- CMF
- Supertrend
- Aroon
- CMO
- DPO
- Guppy
- pattern fallback
- signal aggregation

## Chuẩn cần đạt cho từng indicator

Mỗi indicator nên có:
- tài liệu nguồn tham chiếu
- fixture input OHLCV cố định
- expected output cố định hoặc đối chiếu với thư viện tham chiếu
- test cho giá trị tail gần nhất
- test cho warmup / insufficient data
- ghi rõ tolerance khi so sánh số thực

## Tolerance đề xuất
- Chỉ báo tính từ số thực: `1e-6` cho unit tests nội bộ
- Với pattern/summary: exact match nếu output dạng enum/string
- Không round sớm trong logic tính toán; chỉ format khi render UI

## Tiến độ verification hiện tại

### Đã có baseline verification
- Core indicators: SMA, EMA, RSI, MACD, ATR, ADX, Stochastic, Bollinger %B
- Advanced/custom formulas: DEMA, TEMA, HMA, Donchian, CMF, DPO
- Supertrend hiện mới có **invariant verification**, chưa có canonical external reference được khóa chính thức

### Chưa đủ verification depth
- Supertrend (cần chốt canonical reference implementation)
- Aroon oscillator
- CMO
- Historical Volatility
- Ultimate Oscillator
- Guppy summary logic
- Pattern heuristics / manual fallback logic
- Signal aggregation layer

## Kết luận audit ban đầu

Repo hiện **không có bằng chứng đủ mạnh để tuyên bố tất cả indicator chính xác 100%**.

Tuy nhiên, kiến trúc hiện tại đủ tốt để tiến tới correctness nếu làm theo hướng:
1. khóa source of truth
2. thêm test fixture cho nhóm core
3. audit dần nhóm custom/high-risk
4. chỉ quảng bá financial-grade sau khi có verification coverage thực sự
