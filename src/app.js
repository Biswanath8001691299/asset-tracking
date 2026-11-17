import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import marketRoutes from './routes/market.js';
import holdingRoutes from './routes/holdings.js';
import goldSipRoutes from './routes/goldSips.js';
import portfolioRoutes from './routes/portfolio.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (req, res) => res.json({ ok: true, db: mongoose.connection.readyState === 1 }));
  app.use('/api', marketRoutes);
  app.use('/api/holdings', holdingRoutes);
  app.use('/api/gold-sips', goldSipRoutes);
  app.use('/api/portfolio', portfolioRoutes);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  app.use(express.static(path.join(here, '..', 'public')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    let status = err.status || 500;
    if (err.name === 'ValidationError' || err.name === 'CastError') status = 400;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: err.message || 'Internal error' });
  });
  return app;
}
