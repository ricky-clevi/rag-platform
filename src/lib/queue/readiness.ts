import Redis from 'ioredis';
import { getRedisConnectionOpts } from './connection';
import { ensureEmbeddedWorker } from './embedded-worker';

let lastCheckOk = false;
let lastCheckTime = 0;
const CACHE_MS = 30_000;

/**
 * Verify that crawl infrastructure (Redis) is reachable.
 * In dev mode (or when EMBEDDED_CRAWL_WORKER=true), also starts an
 * in-process BullMQ worker so jobs are processed without a separate terminal.
 */
export async function ensureCrawlReady(): Promise<{ ready: boolean; error?: string }> {
  const now = Date.now();
  if (lastCheckOk && now - lastCheckTime < CACHE_MS) {
    await ensureEmbeddedWorker();
    return { ready: true };
  }

  const opts = getRedisConnectionOpts();
  const redis = new Redis({
    host: opts.host,
    port: opts.port,
    password: opts.password,
    lazyConnect: true,
    connectTimeout: 3000,
    maxRetriesPerRequest: 1,
  });

  try {
    await redis.connect();
    await redis.ping();
    lastCheckOk = true;
    lastCheckTime = now;
  } catch {
    lastCheckOk = false;
    return { ready: false, error: 'Redis is not reachable. Crawl infrastructure unavailable.' };
  } finally {
    redis.disconnect();
  }

  await ensureEmbeddedWorker();

  return { ready: true };
}
