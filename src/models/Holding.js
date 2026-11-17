import mongoose from 'mongoose';

/** One purchase of an Indian stock or a cryptocurrency. */
const holdingSchema = new mongoose.Schema(
  {
    assetType: { type: String, enum: ['stock', 'crypto'], required: true, index: true },
    // stock: Yahoo symbol e.g. RELIANCE.NS / 500325.BO ; crypto: ticker e.g. BTC
    symbol: { type: String, required: true, uppercase: true, trim: true },
    coinId: { type: String, trim: true }, // CoinGecko id for crypto, e.g. "bitcoin"
    name: { type: String, required: true, trim: true },
    exchange: String,
    quantity: { type: Number, required: true, min: [0, 'quantity must be positive'] },
    buyDate: { type: Date, required: true },
    buyPrice: { type: Number, required: true, min: 0 }, // INR per unit
    buyPriceSource: { type: String, enum: ['market', 'manual'], default: 'market' },
    buyPriceDate: Date, // trading day whose close was used when buyPriceSource = market
    fees: { type: Number, default: 0, min: 0 }, // brokerage, taxes etc.
    investedValue: { type: Number, required: true },
    notes: String,

    // Live valuation — refreshed from the market
    currentPrice: Number,
    previousClose: Number,
    currentValue: Number,
    pnl: Number,
    pnlPercent: Number,
    dayChangePercent: Number,
    priceUpdatedAt: Date,
  },
  { timestamps: true },
);

holdingSchema.methods.applyPrice = function applyPrice({ price, previousClose = null, dayChangePercent = null, marketTime = new Date() }) {
  const round = (n) => Math.round(n * 100) / 100;
  this.currentPrice = price;
  this.previousClose = previousClose;
  this.currentValue = round(price * this.quantity);
  this.pnl = round(this.currentValue - this.investedValue);
  this.pnlPercent = this.investedValue ? round((this.pnl / this.investedValue) * 100) : 0;
  this.dayChangePercent = dayChangePercent ?? (previousClose ? round(((price - previousClose) / previousClose) * 100) : null);
  this.priceUpdatedAt = marketTime;
  return this;
};

export const Holding = mongoose.model('Holding', holdingSchema);
