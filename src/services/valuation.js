import { Holding } from '../models/Holding.js';
import { GoldSip } from '../models/GoldSip.js';
import { Snapshot } from '../models/Snapshot.js';
import * as yahoo from './yahoo.js';
import * as coingecko from './coingecko.js';
import * as gold from './gold.js';
import { computeSip } from './sip.js';
import { toDateKey, todayIST } from './dates.js';
import { UpstreamError } from './http.js';

const round = (n) => Math.round(n * 100) / 100;

/** Resolve the buy price for a new stock/crypto purchase from historical market data. */
export async function resolveBuyPrice({ assetType, symbol, coinId }, buyDate) {
  if (assetType === 'stock') return yahoo.getPriceOnDate(symbol, buyDate);
  return coingecko.getPriceOnDate({ id: coinId, symbol }, buyDate);
}

/** (Re)build a SIP's installment ledger from the schedule + historical gold rates, then value it live. */
export async function recalculateSip(sip, livePrice) {
  const today = todayIST();
  const start = toDateKey(sip.startDate);
  const priceOn = start <= today ? await gold.getHistoricalPriceFn(start, today) : () => 0;
  const live = livePrice || (await gold.getLivePrice());
  // Today's installment uses the live rate; past ones use that day's closing rate.
  const result = computeSip(sip, today, (d) => (d === today ? live.pricePerGram : priceOn(d)));
  Object.assign(sip, result, { calculatedUpTo: today });
  sip.applyPrice(live);
  return sip;
}

/** Fetch live prices for everything, store the new valuation in MongoDB and write a snapshot. */
export async function refreshAll() {
  const errors = [];
  const [holdings, sips] = await Promise.all([Holding.find(), GoldSip.find()]);

  // Stocks — one quote per unique symbol
  const stockSymbols = [...new Set(holdings.filter((h) => h.assetType === 'stock').map((h) => h.symbol))];
  const quotes = {};
  await Promise.all(stockSymbols.map(async (s) => {
    try { quotes[s] = await yahoo.getQuote(s); } catch (e) { errors.push(`${s}: ${e.message}`); }
  }));

  // Crypto — one batched CoinGecko call
  const coinIds = [...new Set(holdings.filter((h) => h.assetType === 'crypto').map((h) => h.coinId))];
  let coinPrices = {};
  try { coinPrices = await coingecko.getPricesInr(coinIds); } catch (e) { errors.push(`crypto: ${e.message}`); }

  for (const h of holdings) {
    if (h.assetType === 'stock' && quotes[h.symbol]) h.applyPrice(quotes[h.symbol]);
    if (h.assetType === 'crypto' && coinPrices[h.coinId]) {
      const p = coinPrices[h.coinId];
      h.applyPrice({ price: p.price, dayChangePercent: p.change24hPct != null ? round(p.change24hPct) : null, marketTime: p.marketTime });
    }
  }

  // Gold — live rate, and extend each SIP's ledger with any installments that fell due since last run
  let goldLive = null;
  if (sips.length) {
    try { goldLive = await gold.getLivePrice(); } catch (e) { errors.push(`gold: ${e.message}`); }
  }
  for (const sip of sips) {
    if (!goldLive) continue;
    try {
      if (sip.calculatedUpTo !== todayIST()) await recalculateSip(sip, goldLive);
      else sip.applyPrice(goldLive);
    } catch (e) { errors.push(`${sip.name}: ${e.message}`); }
  }

  await Promise.all([...holdings, ...sips].filter((d) => d.isModified()).map((d) => d.save()));
  const summary = summarize(holdings, sips);
  await Snapshot.create({ stock: summary.stock, crypto: summary.crypto, gold: summary.gold, total: summary.total });
  return { summary, goldLive, errors, refreshedAt: new Date() };
}

export function summarize(holdings, sips) {
  const empty = () => ({ invested: 0, value: 0, pnl: 0, count: 0 });
  const s = { stock: empty(), crypto: empty(), gold: empty() };
  for (const h of holdings) {
    const b = s[h.assetType];
    b.invested += h.investedValue || 0;
    b.value += h.currentValue ?? h.investedValue ?? 0;
    b.count++;
  }
  for (const g of sips) {
    s.gold.invested += g.totalInvested || 0;
    s.gold.value += g.currentValue ?? g.totalInvested ?? 0;
    s.gold.count++;
  }
  const total = empty();
  for (const k of Object.keys(s)) {
    const b = s[k];
    b.invested = round(b.invested); b.value = round(b.value); b.pnl = round(b.value - b.invested);
    b.pnlPercent = b.invested ? round((b.pnl / b.invested) * 100) : 0;
    total.invested += b.invested; total.value += b.value; total.count += b.count;
  }
  total.invested = round(total.invested); total.value = round(total.value); total.pnl = round(total.value - total.invested);
  total.pnlPercent = total.invested ? round((total.pnl / total.invested) * 100) : 0;
  return { ...s, total };
}

export { UpstreamError };
