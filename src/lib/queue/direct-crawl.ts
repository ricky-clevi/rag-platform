import type { CrawlJobData } from '@/types';

const runningJobs = new Set<string>();

/**
 * Run a crawl job directly without Redis/BullMQ.
 * Executes as a fire-and-forget background task.
 * Prevents duplicate runs for the same agent.
 */
export function runDirectCrawl(data: CrawlJobData): void {
  if (runningJobs.has(data.agent_id)) {
    console.warn(`[direct-crawl] Crawl already running for agent ${data.agent_id}, skipping`);
    return;
  }

  runningJobs.add(data.agent_id);
  console.log(`[direct-crawl] Starting direct crawl for agent ${data.agent_id}`);

  // Dynamic import to avoid circular dependencies
  import('./worker')
    .then(({ executeCrawlJob }) => executeCrawlJob(data))
    .then(() => {
      console.log(`[direct-crawl] Crawl completed for agent ${data.agent_id}`);
    })
    .catch((err) => {
      console.error(`[direct-crawl] Crawl failed for agent ${data.agent_id}:`, err);
    })
    .finally(() => {
      runningJobs.delete(data.agent_id);
    });
}
