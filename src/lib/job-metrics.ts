import type { CrawlJob, CrawlJobMetrics, CrawlStats, JobStage } from '@/types';

function inferStage(
  crawlJob: Partial<CrawlJob> | null | undefined,
  crawlStats: CrawlStats | null | undefined
): JobStage {
  if (crawlStats?.current_stage) return crawlStats.current_stage;

  switch (crawlJob?.status) {
    case 'queued':
      return 'queued';
    case 'completed':
      return 'ready';
    case 'failed':
    case 'cancelled':
      return 'failed';
    case 'running':
      return 'fetching';
    default:
      return 'discovering';
  }
}

export function buildJobMetrics(
  crawlJob: Partial<CrawlJob> | null | undefined,
  crawlStats: CrawlStats | null | undefined,
  changedPages = 0
): CrawlJobMetrics {
  const discovered = Number(
    crawlJob?.total_urls_discovered
      || crawlStats?.discovered_urls
      || crawlStats?.total_pages
      || 0
  );
  const crawled = Number(
    crawlJob?.total_urls_crawled
      || crawlStats?.crawled_pages
      || 0
  );
  const skipped = Number(crawlJob?.total_urls_skipped || 0);
  const failed = Number(crawlJob?.total_urls_failed || crawlStats?.errors || 0);
  const totalChunks = Number(crawlJob?.total_chunks_created || crawlStats?.total_chunks || 0);
  const startedAt = crawlJob?.started_at || crawlStats?.started_at;
  const completedAt = crawlJob?.completed_at || crawlStats?.completed_at;

  let pagesPerMinute = Number(crawlStats?.pages_per_minute || 0);
  if (!pagesPerMinute && startedAt) {
    const end = completedAt ? new Date(completedAt).getTime() : Date.now();
    const start = new Date(startedAt).getTime();
    const elapsedMinutes = Math.max((end - start) / 60000, 0.1);
    pagesPerMinute = Math.round(crawled / elapsedMinutes);
  }

  const etaSeconds =
    crawlStats?.eta_seconds != null
      ? crawlStats.eta_seconds
      : !completedAt && pagesPerMinute > 0 && discovered > crawled
        ? Math.ceil(((discovered - crawled) / pagesPerMinute) * 60)
        : null;

  return {
    discovered_urls: discovered,
    crawled_urls: crawled,
    skipped_urls: skipped,
    failed_urls: failed,
    total_chunks: totalChunks,
    changed_page_count: changedPages,
    changed_pages: changedPages,
    pages_per_minute: pagesPerMinute,
    browser_render_share: Number(crawlStats?.browser_render_share || 0),
    embed_queue_depth: Number(
      crawlStats?.embed_queue_depth ?? Math.max(totalChunks - crawled, 0)
    ),
    eta_seconds: etaSeconds,
    eta_minutes: etaSeconds == null ? null : Math.ceil(etaSeconds / 60),
    failure_reason: crawlJob?.error_message || crawlStats?.error_message || null,
    current_stage: inferStage(crawlJob, crawlStats),
  };
}
