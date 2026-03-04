/**
 * Standalone crawl worker process.
 * Run with: npx tsx workers/crawl-worker.ts
 */

import 'dotenv/config';
import { startCrawlWorker } from '../src/lib/queue/worker';

console.log('Starting crawl worker...');
const worker = startCrawlWorker();

console.log('Crawl worker is running. Waiting for jobs...');

// Graceful shutdown
const shutdown = async () => {
  console.log('Shutting down worker...');
  await worker.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
