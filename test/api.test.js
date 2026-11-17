import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { connectDb, disconnectDb } from '../src/db.js';
import { createApp } from '../src/app.js';

// Stub the market data APIs so tests are deterministic and offline.
const day = (d) => Date.parse(`${d}T09:15:00Z`) / 1000;
const chart = (symbol, price, bars = []) => ({
  chart: { result: [{
    meta: { symbol, longName: `${symbol} Ltd`, regularMarketPrice: price, chartPreviousClose: price - 10, currency: 'INR', gmtoffset: 19800, regularMarketTime: day('2026-01-01') },
    timestamp: bars.map((b) => day(b[0])),
    indicators: { quote: [{ close: bars.map((b) => b[1]) }] },
  }] },
});
const routes = [
  [/chart\/RELIANCE\.NS/, () => chart('RELIANCE.NS', 1500, [['2024-03-14', 1390], ['2024-03-15', 1400]])],
  [/chart\/BAD\.NS/, () => ({ status: 404, body: { chart: { error: { description: 'No data found' } } } })],
  [/chart\/GC%3DF|chart\/GC=F/, () => chart('GC=F', 3110.34768, [['2024-12-31', 3110.34768], ['2025-01-31', 3110.34768]])],
  [/chart\/USDINR/, () => chart('USDINR=X', 100, [['2024-12-31', 80], ['2025-01-31', 100]])],
  [/simple\/price/, () => ({ bitcoin: { inr: 5000000, inr_24h_change: 1.5, last_updated_at: 1767225600 } })],
];
const realFetch = globalThis.fetch;
let mongo;

before(async () => {
  globalThis.fetch = async (url) => {
    const hit = routes.find(([re]) => re.test(String(url)));
    if (!hit) return new Response('{}', { status: 404 });
    const out = hit[1]();
    return out.status ? new Response(JSON.stringify(out.body), { status: out.status }) : new Response(JSON.stringify(out), { status: 200 });
  };
  mongo = await MongoMemoryServer.create();
  await connectDb(mongo.getUri('test'));
});

after(async () => {
  globalThis.fetch = realFetch;
  await disconnectDb();
  await mongo.stop();
});

const app = createApp();

test('adds a stock using the market close on the buy date and stores the valuation', async () => {
  const res = await request(app).post('/api/holdings').send({ assetType: 'stock', symbol: 'reliance', quantity: 10, buyDate: '2024-03-16' });
  assert.equal(res.status, 201, res.body.error);
  assert.equal(res.body.symbol, 'RELIANCE.NS');
  assert.equal(res.body.buyPrice, 1400); // Saturday -> Friday's close
  assert.equal(res.body.investedValue, 14000);
  assert.equal(res.body.currentValue, 15000);
  assert.equal(res.body.pnl, 1000);
});

test('manual buy price + fees', async () => {
  const res = await request(app).post('/api/holdings').send({ assetType: 'crypto', coinId: 'bitcoin', symbol: 'btc', quantity: 0.1, buyDate: '2025-01-01', buyPrice: 4000000, fees: 100 });
  assert.equal(res.status, 201, res.body.error);
  assert.equal(res.body.investedValue, 400100);
  assert.equal(res.body.currentValue, 500000);
  assert.equal(res.body.dayChangePercent, 1.5);
});

test('rejects unknown symbols and bad input', async () => {
  assert.equal((await request(app).post('/api/holdings').send({ assetType: 'stock', symbol: 'BAD', quantity: 1, buyDate: '2024-01-01' })).status, 400);
  assert.equal((await request(app).post('/api/holdings').send({ assetType: 'stock', symbol: 'RELIANCE', quantity: 0, buyDate: '2024-01-01' })).status, 400);
  assert.equal((await request(app).post('/api/holdings').send({ assetType: 'stock', symbol: 'RELIANCE', quantity: 1, buyDate: '2999-01-01' })).status, 400);
});

test('gold SIP ledger is built from historical gold prices', async () => {
  const res = await request(app).post('/api/gold-sips').send({ sipAmount: 1030, gstPercent: 3, frequency: 'monthly', startDate: '2025-01-01', endDate: '2025-02-01' });
  assert.equal(res.status, 201, res.body.error);
  // Jan 1 -> uses Dec 31 close: 3110.34768 * 80 / 31.1034768 * 1.06 = 8480/g ; Feb 1 -> Jan 31 close: 10600/g
  assert.equal(res.body.installmentCount, 2);
  assert.equal(res.body.installments[0].pricePerGram, 8480);
  assert.equal(res.body.installments[1].pricePerGram, 10600);
  assert.equal(res.body.totalInvested, 2060);
  assert.equal(res.body.totalGst, 60);
  assert.equal(res.body.currentPricePerGram, 10600);
});

test('portfolio summary + snapshot', async () => {
  const res = await request(app).get('/api/portfolio?refresh=true');
  assert.equal(res.status, 200);
  assert.equal(res.body.summary.stock.value, 15000);
  assert.equal(res.body.summary.crypto.value, 500000);
  assert.equal(res.body.summary.total.count, 3);
  assert.deepEqual(res.body.errors, []);
  const hist = await request(app).get('/api/portfolio/history');
  assert.ok(hist.body.length >= 1);
});
