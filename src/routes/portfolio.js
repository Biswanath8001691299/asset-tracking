import { Router } from 'express';
import { Holding } from '../models/Holding.js';
import { GoldSip } from '../models/GoldSip.js';
import { Snapshot } from '../models/Snapshot.js';
import { refreshAll, summarize } from '../services/valuation.js';
import { config } from '../config.js';
import { asyncRoute } from './util.js';

const r = Router();
let lastRefresh = null;

export async function runRefresh() {
  const result = await refreshAll();
  lastRefresh = result;
  return result;
}

r.get('/', asyncRoute(async (req, res) => {
  const stale = !lastRefresh || Date.now() - lastRefresh.refreshedAt.getTime() > config.priceCacheSeconds * 1000;
  const refresh = req.query.refresh === 'true' || (stale && req.query.refresh !== 'false') ? await runRefresh() : lastRefresh;
  const [holdings, sips] = await Promise.all([Holding.find().sort({ buyDate: -1 }), GoldSip.find({}, { installments: 0 }).sort({ startDate: -1 })]);
  res.json({
    summary: summarize(holdings, sips),
    stocks: holdings.filter((h) => h.assetType === 'stock'),
    crypto: holdings.filter((h) => h.assetType === 'crypto'),
    goldSips: sips,
    goldPrice: refresh?.goldLive || null,
    refreshedAt: refresh?.refreshedAt || null,
    errors: refresh?.errors || [],
  });
}));

r.post('/refresh', asyncRoute(async (req, res) => res.json(await runRefresh())));

r.get('/history', asyncRoute(async (req, res) => {
  const days = Math.min(Number(req.query.days) || 90, 3650);
  const since = new Date(Date.now() - days * 86400000);
  res.json(await Snapshot.find({ at: { $gte: since } }).sort({ at: 1 }).lean());
}));

export default r;
