import Redis from 'ioredis';
import { getRedisConnectionOpts } from '@/lib/queue/connection';

let checkpointClient: Redis | null = null;

function getClient(): Redis {
  if (!checkpointClient) {
    checkpointClient = new Redis(getRedisConnectionOpts());
  }
  return checkpointClient;
}

export interface CrawlCheckpoint {
  agentId: string;
  crawlJobId: string;
  visitedUrls: string[];
  queuedUrls: string[];
  totalPages: number;
  totalChunks: number;
  errors: number;
  skipped: number;
  lastSavedAt: string;
}

const CHECKPOINT_TTL = 86400; // 24 hours

function checkpointKey(agentId: string): string {
  return `checkpoint:crawl:${agentId}`;
}

export async function saveCheckpoint(checkpoint: CrawlCheckpoint): Promise<void> {
  try {
    const redis = getClient();
    await redis.setex(
      checkpointKey(checkpoint.agentId),
      CHECKPOINT_TTL,
      JSON.stringify(checkpoint)
    );
  } catch (error) {
    console.error('Failed to save crawl checkpoint:', error);
  }
}

export async function loadCheckpoint(agentId: string): Promise<CrawlCheckpoint | null> {
  try {
    const redis = getClient();
    const data = await redis.get(checkpointKey(agentId));
    if (data) {
      return JSON.parse(data);
    }
    return null;
  } catch {
    return null;
  }
}

export async function clearCheckpoint(agentId: string): Promise<void> {
  try {
    const redis = getClient();
    await redis.del(checkpointKey(agentId));
  } catch { /* ignore */ }
}
