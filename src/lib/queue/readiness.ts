import Redis from 'ioredis';
import { getRedisConnectionOpts } from './connection';
import { ensureEmbeddedWorker } from './embedded-worker';

let lastCheckResult: 'redis' | 'direct' | null = null;
let lastCheckTime = 0;
const CACHE_MS = 30_000;

export interface CrawlReadiness {
  ready: true;
  mode: 'redis' | 'direct';
}

/**
 * Verify crawl infrastructure availability.
 * - If Redis is reachable, uses BullMQ queue + embedded worker ('redis' mode).
 * - If Redis is unreachable, falls back to direct in-process execution ('direct' mode).
 * Always returns ready: true so crawls are never blocked.
 */
export async function ensureCrawlReady(): Promise<CrawlReadiness> {
  const now = Date.now();
  if (lastCheckResult && now - lastCheckTime < CACHE_MS) {
    if (lastCheckResult === 'redis') {
      await ensureEmbeddedWorker();
    }
    return { ready: true, mode: lastCheckResult };
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
    lastCheckResult = 'redis';
    lastCheckTime = now;
    await ensureEmbeddedWorker();
    return { ready: true, mode: 'redis' };
  } catch {
    console.warn('[readiness] Redis unavailable, using direct crawl execution mode');
    lastCheckResult = 'direct';
    lastCheckTime = now;
    return { ready: true, mode: 'direct' };
  } finally {
    redis.disconnect();
  }
}
