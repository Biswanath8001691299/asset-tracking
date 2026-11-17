import { Router } from 'express';
import { GoldSip } from '../models/GoldSip.js';
import { FREQUENCIES } from '../services/sip.js';
import { recalculateSip } from '../services/valuation.js';
import { keyToDate, toDateKey } from '../services/dates.js';
import { asyncRoute, BadRequest, positiveNumber, pastOrTodayDate } from './util.js';

const r = Router();

function readFields(b, existing = {}) {
  const out = {};
  const has = (k) => b[k] !== undefined;
  if (has('name')) out.name = String(b.name).trim() || 'Gold SIP';
  if (has('platform')) out.platform = b.platform;
  if (has('sipAmount') || !existing.sipAmount) out.sipAmount = positiveNumber(b.sipAmount, 'sipAmount');
  if (has('gstPercent')) {
    const g = Number(b.gstPercent);
    if (!Number.isFinite(g) || g < 0 || g > 100) throw new BadRequest('gstPercent must be between 0 and 100');
    out.gstPercent = g;
  }
  if (has('gstInclusive')) out.gstInclusive = b.gstInclusive === true || b.gstInclusive === 'true';
  if (has('frequency') || !existing.frequency) {
    if (!FREQUENCIES.includes(b.frequency)) throw new BadRequest(`frequency must be one of: ${FREQUENCIES.join(', ')}`);
    out.frequency = b.frequency;
  }
  if (has('startDate') || !existing.startDate) out.startDate = keyToDate(pastOrTodayDate(b.startDate, 'startDate'));
  if (has('endDate')) out.endDate = b.endDate ? keyToDate(toDateKey(b.endDate)) : null;
  if (has('premiumPercent')) {
    const p = Number(b.premiumPercent);
    if (!Number.isFinite(p) || p < 0 || p > 50) throw new BadRequest('premiumPercent must be between 0 and 50');
    out.premiumPercent = p;
  }
  const start = out.startDate || existing.startDate;
  const end = out.endDate === undefined ? existing.endDate : out.endDate;
  if (end && start && toDateKey(end) < toDateKey(start)) throw new BadRequest('endDate must be after startDate');
  return out;
}

const listProjection = { installments: 0 };

r.get('/', asyncRoute(async (req, res) => res.json(await GoldSip.find({}, listProjection).sort({ startDate: -1 }))));

r.get('/:id', asyncRoute(async (req, res) => {
  const sip = await GoldSip.findById(req.params.id);
  if (!sip) return res.status(404).json({ error: 'Gold SIP not found' });
  res.json(sip);
}));

r.post('/', asyncRoute(async (req, res) => {
  const sip = new GoldSip(readFields(req.body));
  await recalculateSip(sip);
  await sip.save();
  res.status(201).json(sip);
}));

r.put('/:id', asyncRoute(async (req, res) => {
  const sip = await GoldSip.findById(req.params.id);
  if (!sip) return res.status(404).json({ error: 'Gold SIP not found' });
  sip.set(readFields(req.body, sip));
  await recalculateSip(sip);
  await sip.save();
  res.json(sip);
}));

r.delete('/:id', asyncRoute(async (req, res) => {
  const sip = await GoldSip.findByIdAndDelete(req.params.id);
  if (!sip) return res.status(404).json({ error: 'Gold SIP not found' });
  res.status(204).end();
}));

export default r;
