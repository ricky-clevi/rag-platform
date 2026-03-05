import { Queue } from 'bullmq';
import { getRedisConnectionOpts } from './connection';
import type { CrawlJobData } from '@/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let crawlQueue: Queue | null = null;

export function getCrawlQueue(): Queue {
  if (!crawlQueue) {
    crawlQueue = new Queue('crawl', {
      connection: getRedisConnectionOpts(),
      defaultJobOptions: {
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    });
  }
  return crawlQueue;
}

export async function addCrawlJob(data: CrawlJobData): Promise<string> {
  const queue = getCrawlQueue();
  const job = await queue.add('crawl-website', data, {
    jobId: `crawl-${data.agent_id}-${Date.now()}`,
  });
  return job.id || data.agent_id;
}
