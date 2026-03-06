import Redis from 'ioredis';
import { createHash } from 'crypto';
import { getRedisConnectionOpts } from '@/lib/queue/connection';

let cacheClient: Redis | null = null;

function getCache(): Redis {
  if (!cacheClient) {
    cacheClient = new Redis(getRedisConnectionOpts());
  }
  return cacheClient;
}

function hashKey(parts: string[]): string {
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

// Cache TTL in seconds
const EMBEDDING_CACHE_TTL = 3600; // 1 hour
const RESPONSE_CACHE_TTL = 1800; // 30 minutes
const SEARCH_CACHE_TTL = 900; // 15 minutes

// --- Query Embedding Cache ---
export async function getCachedEmbedding(query: string): Promise<number[] | null> {
  try {
    const key = `emb:${hashKey([query])}`;
    const cached = await getCache().get(key);
    if (cached) return JSON.parse(cached);
    return null;
  } catch {
    return null;
  }
}

export async function setCachedEmbedding(query: string, embedding: number[]): Promise<void> {
  try {
    const key = `emb:${hashKey([query])}`;
    await getCache().setex(key, EMBEDDING_CACHE_TTL, JSON.stringify(embedding));
  } catch { /* ignore cache failures */ }
}

// --- Search Results Cache ---
export async function getCachedSearchResults(agentId: string, query: string): Promise<unknown[] | null> {
  try {
    const key = `search:${hashKey([agentId, query])}`;
    const cached = await getCache().get(key);
    if (cached) return JSON.parse(cached);
    return null;
  } catch {
    return null;
  }
}

export async function setCachedSearchResults(agentId: string, query: string, results: unknown[]): Promise<void> {
  try {
    const key = `search:${hashKey([agentId, query])}`;
    await getCache().setex(key, SEARCH_CACHE_TTL, JSON.stringify(results));
  } catch { /* ignore cache failures */ }
}

// --- Response Cache ---
export async function getCachedResponse(
  agentId: string,
  query: string
): Promise<{ answer: string; sources: unknown[] } | null> {
  try {
    const key = `resp:${hashKey([agentId, query.toLowerCase().trim()])}`;
    const cached = await getCache().get(key);
    if (cached) return JSON.parse(cached);
    return null;
  } catch {
    return null;
  }
}

export async function setCachedResponse(
  agentId: string,
  query: string,
  response: { answer: string; sources: unknown[] }
): Promise<void> {
  try {
    const key = `resp:${hashKey([agentId, query.toLowerCase().trim()])}`;
    await getCache().setex(key, RESPONSE_CACHE_TTL, JSON.stringify(response));
  } catch { /* ignore cache failures */ }
}

// --- Cache Invalidation ---
export async function invalidateAgentCache(agentId: string): Promise<void> {
  try {
    const redis = getCache();
    // Use SCAN to find and delete all keys for this agent
    let cursor = '0';
    const keysToDelete: string[] = [];

    do {
      const [nextCursor, keys] = await redis.scan(
        cursor, 'MATCH', `*:${hashKey([agentId, '*']).slice(0, 16)}*`, 'COUNT', 100
      );
      cursor = nextCursor;
      keysToDelete.push(...keys);
    } while (cursor !== '0');

    // Also scan for search and response keys
    cursor = '0';
    do {
      const [nextCursor, keys] = await redis.scan(
        cursor, 'MATCH', `search:*`, 'COUNT', 100
      );
      cursor = nextCursor;
      // Check each key - this is expensive but cache invalidation is rare
      for (const key of keys) {
        const value = await redis.get(key);
        if (value && value.includes(agentId)) {
          keysToDelete.push(key);
        }
      }
    } while (cursor !== '0');

    if (keysToDelete.length > 0) {
      await redis.del(...keysToDelete);
    }
  } catch { /* ignore cache failures */ }
}

// Simpler invalidation: just clear all caches for an agent using a known prefix
export async function invalidateAgentCacheSimple(agentId: string): Promise<void> {
  try {
    const redis = getCache();
    const agentHash = hashKey([agentId]).slice(0, 16);
    let cursor = '0';

    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `*${agentHash}*`, 'COUNT', 200);
      cursor = nextCursor;
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== '0');
  } catch { /* ignore */ }
}
