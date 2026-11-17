import mongoose from 'mongoose';

/** Point-in-time portfolio valuation, written on every refresh — powers the history chart. */
const bucket = { invested: Number, value: Number, pnl: Number };
const snapshotSchema = new mongoose.Schema({
  at: { type: Date, default: Date.now, index: true },
  stock: bucket,
  crypto: bucket,
  gold: bucket,
  total: bucket,
});

export const Snapshot = mongoose.model('Snapshot', snapshotSchema);
