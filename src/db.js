import mongoose from 'mongoose';
import { config } from './config.js';

let memoryServer;

export async function connectDb(uri = config.mongoUri) {
  if (config.useMemoryDb && uri === config.mongoUri) {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri('asset_tracker');
    console.log('Using in-memory MongoDB (data is lost when the server stops)');
  }
  await mongoose.connect(uri);
  return mongoose.connection;
}

export async function disconnectDb() {
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
}
