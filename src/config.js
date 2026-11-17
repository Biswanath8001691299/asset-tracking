import 'dotenv/config';

const num = (v, d) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));

export const config = {
  port: num(process.env.PORT, 4000),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/asset_tracker',
  useMemoryDb: process.env.USE_MEMORY_DB === 'true' || process.argv.includes('--memory'),
  priceCacheSeconds: num(process.env.PRICE_CACHE_SECONDS, 60),
  autoRefreshMinutes: num(process.env.AUTO_REFRESH_MINUTES, 15),
  goldImportDutyPct: num(process.env.GOLD_IMPORT_DUTY_PCT, 6),
  coingeckoApiKey: process.env.COINGECKO_API_KEY || '',
};
