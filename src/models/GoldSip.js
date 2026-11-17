import mongoose from 'mongoose';
import { FREQUENCIES } from '../services/sip.js';

const installmentSchema = new mongoose.Schema(
  { date: Date, amountPaid: Number, gst: Number, netAmount: Number, pricePerGram: Number, grams: Number },
  { _id: false },
);

const goldSipSchema = new mongoose.Schema(
  {
    name: { type: String, default: 'Gold SIP', trim: true },
    platform: { type: String, trim: true }, // e.g. the app/bank you invest through
    sipAmount: { type: Number, required: true, min: [1, 'sipAmount must be at least 1'] },
    gstPercent: { type: Number, default: 3, min: 0, max: 100 },
    gstInclusive: { type: Boolean, default: true },
    frequency: { type: String, enum: FREQUENCIES, required: true },
    startDate: { type: Date, required: true },
    endDate: Date, // empty = still running
    premiumPercent: { type: Number, default: 0 }, // platform spread over market rate, if any
    active: { type: Boolean, default: true },

    // Calculated from the schedule and historical gold prices
    installments: [installmentSchema],
    installmentCount: Number,
    totalInvested: Number, // incl. GST
    totalGst: Number,
    totalNetInvested: Number,
    totalGrams: Number,
    avgCostPerGram: Number,
    nextInstallmentDate: Date,
    calculatedUpTo: String, // YYYY-MM-DD

    // Live valuation
    currentPricePerGram: Number,
    currentValue: Number,
    pnl: Number,
    pnlPercent: Number,
    priceUpdatedAt: Date,
  },
  { timestamps: true },
);

goldSipSchema.methods.applyPrice = function applyPrice({ pricePerGram, marketTime = new Date() }) {
  const round = (n) => Math.round(n * 100) / 100;
  this.currentPricePerGram = round(pricePerGram);
  this.currentValue = round((this.totalGrams || 0) * pricePerGram);
  this.pnl = round(this.currentValue - (this.totalInvested || 0));
  this.pnlPercent = this.totalInvested ? round((this.pnl / this.totalInvested) * 100) : 0;
  this.priceUpdatedAt = marketTime;
  return this;
};

export const GoldSip = mongoose.model('GoldSip', goldSipSchema);
