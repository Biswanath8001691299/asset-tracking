import { Router } from 'express';
import { Holding } from '../models/Holding.js';
import * as yahoo from '../services/yahoo.js';
import * as coingecko from '../services/coingecko.js';
import { resolveBuyPrice } from '../services/valuation.js';
import { keyToDate, toDateKey } from '../services/dates.js';
import { asyncRoute, BadRequest, positiveNumber, nonNegativeNumber, pastOrTodayDate, normalizeStockSymbol } from './util.js';

const r = Router();
const round = (n) => Math.round(n * 100) / 100;

async function identify(type, body) {
  if (type === 'stock') {
    const symbol = normalizeStockSymbol(body.symbol);
    const quote = await yahoo.getQuote(symbol).catch((e) => {
      throw e.status === 404 ? new BadRequest(`"${symbol}" was not found on NSE/BSE. Use the search to pick a valid symbol.`) : e;
    });
    return { symbol, name: body.name || quote.name, exchange: symbol.endsWith('.BO') ? 'BSE' : 'NSE', live: quote };
  }
  const coinId = String(body.coinId || '').trim().toLowerCase();
  if (!coinId) throw new BadRequest('coinId is required (CoinGecko id, e.g. "bitcoin")');
  const live = await coingecko.getPriceInr(coinId).catch((e) => {
    throw e.status === 404 ? new BadRequest(`Coin "${coinId}" was not found on CoinGecko. Use the search to pick a coin.`) : e;
  });
  const fallbackName = coinId.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return { coinId, symbol: (body.symbol || coinId).toUpperCase(), name: body.name || fallbackName, exchange: 'CoinGecko', live };
}

/** Build/refresh buy price + invested value. Market close on buy date unless the user gave a price. */
async function applyBuy(doc, body) {
  const manual = body.buyPrice !== undefined && body.buyPrice !== null && body.buyPrice !== '';
  if (manual) {
    doc.buyPrice = positiveNumber(body.buyPrice, 'buyPrice');
    doc.buyPriceSource = 'manual';
    doc.buyPriceDate = undefined;
  } else {
    const p = await resolveBuyPrice(doc, toDateKey(doc.buyDate));
    doc.buyPrice = round(p.price);
    doc.buyPriceSource = 'market';
    doc.buyPriceDate = keyToDate(p.date);
  }
  doc.investedValue = round(doc.buyPrice * doc.quantity + (doc.fees || 0));
}

function applyLive(doc, live) {
  if (doc.assetType === 'stock') doc.applyPrice(live);
  else doc.applyPrice({ price: live.price, dayChangePercent: live.change24hPct != null ? round(live.change24hPct) : null, marketTime: live.marketTime });
}

r.get('/', asyncRoute(async (req, res) => {
  const filter = req.query.type ? { assetType: req.query.type } : {};
  res.json(await Holding.find(filter).sort({ buyDate: -1 }));
}));

r.get('/:id', asyncRoute(async (req, res) => {
  const h = await Holding.findById(req.params.id);
  if (!h) return res.status(404).json({ error: 'Holding not found' });
  res.json(h);
}));

r.post('/', asyncRoute(async (req, res) => {
  const type = req.body.assetType;
  if (!['stock', 'crypto'].includes(type)) throw new BadRequest('assetType must be "stock" or "crypto"');
  const id = await identify(type, req.body);
  const doc = new Holding({
    assetType: type,
    symbol: id.symbol,
    coinId: id.coinId,
    name: id.name,
    exchange: id.exchange,
    quantity: positiveNumber(req.body.quantity, 'quantity'),
    buyDate: keyToDate(pastOrTodayDate(req.body.buyDate, 'buyDate')),
    fees: nonNegativeNumber(req.body.fees, 'fees'),
    notes: req.body.notes,
  });
  await applyBuy(doc, req.body);
  applyLive(doc, id.live);
  await doc.save();
  res.status(201).json(doc);
}));

r.put('/:id', asyncRoute(async (req, res) => {
  const doc = await Holding.findById(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Holding not found' });
  const b = req.body;
  if (b.quantity !== undefined) doc.quantity = positiveNumber(b.quantity, 'quantity');
  if (b.buyDate !== undefined) doc.buyDate = keyToDate(pastOrTodayDate(b.buyDate, 'buyDate'));
  if (b.fees !== undefined) doc.fees = nonNegativeNumber(b.fees, 'fees');
  if (b.notes !== undefined) doc.notes = b.notes;
  if (b.name) doc.name = b.name;
  // Keep a manual price unless a new one is sent or the user explicitly asks for market price
  const body = { ...b };
  if (body.buyPrice === undefined && doc.buyPriceSource === 'manual' && !b.useMarketPrice) body.buyPrice = doc.buyPrice;
  if (b.useMarketPrice) delete body.buyPrice;
  await applyBuy(doc, body);
  if (doc.currentPrice) doc.applyPrice({ price: doc.currentPrice, previousClose: doc.previousClose, dayChangePercent: doc.dayChangePercent, marketTime: doc.priceUpdatedAt });
  await doc.save();
  res.json(doc);
}));

r.delete('/:id', asyncRoute(async (req, res) => {
  const doc = await Holding.findByIdAndDelete(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Holding not found' });
  res.status(204).end();
}));

export default r;
