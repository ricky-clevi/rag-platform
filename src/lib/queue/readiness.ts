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
 * - In development: always uses direct mode (avoids BullMQ stale code issues with HMR).
 * - In production with Redis: uses BullMQ queue + embedded worker ('redis' mode).
 * - In production without Redis: falls back to direct in-process execution ('direct' mode).
 * Always returns ready: true so crawls are never blocked.
 */
export async function ensureCrawlReady(): Promise<CrawlReadiness> {
  // In development, always use direct mode to ensure fresh code on every crawl
  if (process.env.NODE_ENV !== 'production') {
    return { ready: true, mode: 'direct' };
  }

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
