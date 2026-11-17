import { config } from './config.js';
import { connectDb, disconnectDb } from './db.js';
import { createApp } from './app.js';
import { runRefresh } from './routes/portfolio.js';

await connectDb();
const app = createApp();
const server = app.listen(config.port, () => console.log(`Asset tracker running at http://localhost:${config.port}`));

let timer;
if (config.autoRefreshMinutes > 0) {
  timer = setInterval(() => {
    runRefresh().then((r) => r.errors.length && console.warn('Refresh warnings:', r.errors))
      .catch((e) => console.error('Auto refresh failed:', e.message));
  }, config.autoRefreshMinutes * 60000);
}

const shutdown = async () => {
  clearInterval(timer);
  server.close();
  await disconnectDb();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
