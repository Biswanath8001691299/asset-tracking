# Asset Tracker

Track all your assets in one place — **Indian stocks (NSE/BSE)**, **crypto** and **gold SIP** — valued with live market prices and stored in **MongoDB**.

![stack](https://img.shields.io/badge/Node-20%2B-green) ![db](https://img.shields.io/badge/MongoDB-mongoose-brightgreen)

## What it does

| Asset | You enter | The app calculates |
|---|---|---|
| Indian stock | Stock (searchable by name), quantity, purchase date. Optional: buy price, brokerage/charges | Buy price = that day's NSE/BSE closing price (previous trading day on holidays) unless you type your own. Invested value, live price, current value, day change, P&L |
| Crypto | Coin (searchable), quantity, purchase date. Optional: buy price, fees | Buy price in INR on that date, live INR price, current value, 24h change, P&L |
| Gold SIP | SIP amount, GST % (default 3%), whether GST is included in the amount, frequency (daily / weekly / monthly / quarterly), start date, optional end date | Every installment from start date until today, GST paid, the grams each installment bought at **that day's** gold rate, total grams, average cost/gram, live value, P&L. New installments are added automatically as they fall due |

All values are saved in MongoDB and revalued from the live market every time you open/refresh the dashboard and in the background (every 15 min by default). Each refresh also stores a snapshot, which powers the "portfolio value over time" chart.

## Market data sources

| Data | Source |
|---|---|
| NSE/BSE live price, history and search | Yahoo Finance (`RELIANCE.NS`, `500325.BO` …) |
| Crypto live INR price and search | CoinGecko |
| Crypto price on an older purchase date | CoinGecko (last 365 days), Yahoo Finance `BTC-INR` beyond that |
| Gold rate | COMEX gold (`GC=F`, USD/oz) × USD/INR ÷ 31.1035 g × (1 + import duty) |

No API keys are required.

**Accuracy notes**

- The Indian gold rate is derived from the international rate plus import duty (`GOLD_IMPORT_DUTY_PCT`, default 6%). It closely tracks the 24K (999) rate quoted by Indian jewellers and digital-gold apps *excluding GST*. If your SIP platform charges a spread over the market rate, set the **Platform spread %** on the SIP so the grams match your statement.
- Yahoo Finance NSE/BSE quotes may lag the exchange by a few minutes during market hours. Closing prices are exact.
- Free APIs have rate limits, so prices are cached for `PRICE_CACHE_SECONDS` (60s default).

## Run it

Requirements: Node.js 20+ and MongoDB (local install or a free MongoDB Atlas cluster).

```bash
npm install
cp .env.example .env      # set MONGODB_URI
npm start                 # http://localhost:4000
```

No MongoDB yet? Try it with a throwaway in-memory database:

```bash
npm run dev:memory
```

Run the tests (market APIs are stubbed, so they work offline):

```bash
npm test
```

## Configuration (`.env`)

| Variable | Default | Meaning |
|---|---|---|
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/asset_tracker` | MongoDB connection string |
| `PORT` | `4000` | HTTP port |
| `PRICE_CACHE_SECONDS` | `60` | How long a live price is reused |
| `AUTO_REFRESH_MINUTES` | `15` | Background revaluation interval (0 = off) |
| `GOLD_IMPORT_DUTY_PCT` | `6` | Duty added to the international gold rate |
| `COINGECKO_API_KEY` | – | Optional CoinGecko demo key for higher limits |

## REST API

| Method & path | Body / query | Description |
|---|---|---|
| `GET /api/portfolio` | `?refresh=true` | Summary + all holdings with live valuation |
| `POST /api/portfolio/refresh` | | Revalue everything now and store a snapshot |
| `GET /api/portfolio/history` | `?days=90` | Stored snapshots |
| `GET /api/holdings` | `?type=stock\|crypto` | List purchases |
| `POST /api/holdings` | `{ assetType: "stock", symbol: "RELIANCE", quantity: 10, buyDate: "2024-03-15", buyPrice?, fees?, notes? }` | Add a stock (`.NS` added if no exchange suffix) |
| `POST /api/holdings` | `{ assetType: "crypto", coinId: "bitcoin", symbol: "BTC", quantity: 0.01, buyDate: "2025-06-01", buyPrice?, fees? }` | Add crypto (`coinId` = CoinGecko id) |
| `PUT /api/holdings/:id` | any of `quantity, buyDate, buyPrice, fees, notes, useMarketPrice` | Edit (re-prices from market if no manual price) |
| `DELETE /api/holdings/:id` | | Delete |
| `GET /api/gold-sips` / `GET /api/gold-sips/:id` | | List SIPs / one SIP with full installment ledger |
| `POST /api/gold-sips` | `{ sipAmount: 1000, gstPercent: 3, gstInclusive: true, frequency: "monthly", startDate: "2025-01-05", endDate?, name?, platform?, premiumPercent? }` | Add a gold SIP |
| `PUT /api/gold-sips/:id`, `DELETE /api/gold-sips/:id` | | Edit (ledger is recalculated) / delete |
| `GET /api/search/stocks?q=` / `GET /api/search/crypto?q=` | | Search NSE/BSE stocks or coins |
| `GET /api/quote/stock/:symbol`, `/api/quote/crypto/:id`, `/api/quote/gold` | `?date=YYYY-MM-DD` | Live quote (and price on a date) |

## Project layout

```
src/
  server.js            entry point, background refresh
  app.js               Express app & routes
  models/              Holding (stock/crypto), GoldSip, Snapshot
  services/            yahoo, coingecko, gold, sip (schedule + GST maths), valuation
  routes/              REST endpoints
public/                dashboard (HTML/CSS/JS, no build step)
test/                  node:test unit + API tests
```
