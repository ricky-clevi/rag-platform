import type { Worker } from 'bullmq';
import type { CrawlJobData } from '@/types';

const globalForWorker = globalThis as unknown as {
  __embeddedCrawlWorker?: Worker<CrawlJobData>;
  __embeddedCrawlWorkerStarting?: boolean;
};

function shouldUseEmbeddedWorker(): boolean {
  const env = process.env.EMBEDDED_CRAWL_WORKER;
  if (env === 'true') return true;
  if (env === 'false') return false;
  // Default: enabled in development, disabled in production
  return process.env.NODE_ENV !== 'production';
}

export async function ensureEmbeddedWorker(): Promise<void> {
  if (!shouldUseEmbeddedWorker()) return;
  if (globalForWorker.__embeddedCrawlWorker || globalForWorker.__embeddedCrawlWorkerStarting) return;

  globalForWorker.__embeddedCrawlWorkerStarting = true;
  try {
    const { startCrawlWorker } = await import('./worker');
    globalForWorker.__embeddedCrawlWorker = startCrawlWorker();
    console.log('[embedded-worker] Crawl worker started in-process');
  } catch (error) {
    console.error('[embedded-worker] Failed to start crawl worker:', error);
  } finally {
    globalForWorker.__embeddedCrawlWorkerStarting = false;
  }
}
