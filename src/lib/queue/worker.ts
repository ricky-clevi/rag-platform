import { Worker, Job } from 'bullmq';
import { getRedisConnectionOpts } from './connection';
import { crawlWebsite, type CrawlResult } from '@/lib/crawler';
import { generateEmbedding } from '@/lib/gemini/embeddings';
import { createServiceClient } from '@/lib/supabase/server';
import type { CrawlJobData } from '@/types';

async function processCrawlJob(job: Job<CrawlJobData>) {
  const { agent_id, root_url, crawl_job_id, job_type } = job.data;
  const supabase = createServiceClient();

  const startedAt = new Date().toISOString();

  // Update agent status to crawling
  await supabase
    .from('agents')
    .update({
      status: 'crawling',
      crawl_stats: { started_at: startedAt, crawled_pages: 0, total_chunks: 0, errors: 0 },
    })
    .eq('id', agent_id);

  // Update crawl job status
  if (crawl_job_id) {
    await supabase
      .from('crawl_jobs')
      .update({ status: 'running', started_at: startedAt })
      .eq('id', crawl_job_id);
  }

  let totalPagesProcessed = 0;
  let totalChunksProcessed = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  // For incremental crawls, load existing page data
  let existingPages: Map<string, { etag?: string; lastModified?: string; contentHash?: string }> | undefined;
  if (job_type === 'incremental') {
    const { data: pages } = await supabase
      .from('pages')
      .select('url, etag, last_modified, content_hash')
      .eq('agent_id', agent_id);

    if (pages) {
      existingPages = new Map();
      for (const p of pages) {
        existingPages.set(p.url, {
          etag: p.etag || undefined,
          lastModified: p.last_modified || undefined,
          contentHash: p.content_hash || undefined,
        });
      }
    }
  }

  try {
    const result = await crawlWebsite(root_url, {
      onPageCrawled: async (crawlResult: CrawlResult) => {
        // Store/update page
        const { data: page } = await supabase
          .from('pages')
          .upsert(
            {
              agent_id,
              crawl_job_id: crawl_job_id || null,
              url: crawlResult.url,
              canonical_url: crawlResult.canonicalUrl,
              title: crawlResult.title,
              language: crawlResult.language,
              status_code: crawlResult.statusCode,
              etag: crawlResult.etag,
              last_modified: crawlResult.lastModified,
              content_hash: crawlResult.contentHash,
              robots_allowed: crawlResult.robotsAllowed,
              clean_markdown: crawlResult.content,
              raw_html_length: crawlResult.rawHtmlLength,
              page_type: crawlResult.pageType,
              crawl_status: 'crawled',
              last_crawled_at: new Date().toISOString(),
            },
            { onConflict: 'agent_id,url' }
          )
          .select('id')
          .single();

        if (!page) return;

        // Delete old chunks for this page (on recrawl)
        await supabase
          .from('chunks')
          .delete()
          .eq('page_id', page.id);

        // Generate embeddings and store chunks
        for (const chunk of crawlResult.chunks) {
          try {
            const embedding = await generateEmbedding(chunk.content);

            await supabase.from('chunks').insert({
              agent_id,
              page_id: page.id,
              chunk_index: chunk.chunk_index,
              heading_path: chunk.heading_path,
              content: chunk.content,
              snippet: chunk.snippet,
              language: crawlResult.language,
              token_count: chunk.token_count,
              rank_weight: 1.0,
              content_hash: crawlResult.contentHash,
              embedding: JSON.stringify(embedding),
            });

            totalChunksProcessed++;
          } catch (embError) {
            console.error('Embedding error for chunk:', embError);
          }
        }

        totalPagesProcessed++;

        // Update progress
        await supabase
          .from('agents')
          .update({
            crawl_stats: {
              started_at: startedAt,
              crawled_pages: totalPagesProcessed,
              total_chunks: totalChunksProcessed,
              errors: totalFailed,
            },
          })
          .eq('id', agent_id);

        // Update crawl job progress
        if (crawl_job_id) {
          await supabase
            .from('crawl_jobs')
            .update({
              total_urls_crawled: totalPagesProcessed,
              total_chunks_created: totalChunksProcessed,
              total_urls_skipped: totalSkipped,
              total_urls_failed: totalFailed,
            })
            .eq('id', crawl_job_id);
        }
      },

      onProgress: (_crawled, _discovered, _currentUrl) => {
        // Progress updates handled in onPageCrawled
      },

      onError: (url, error) => {
        totalFailed++;
        console.error(`Crawl error for ${url}: ${error}`);
      },

      onPageSkipped: (_url, _reason) => {
        totalSkipped++;
      },
    }, { existingPages, jobType: job_type });

    const completedAt = new Date().toISOString();

    // Mark as ready
    await supabase
      .from('agents')
      .update({
        status: 'ready',
        crawl_stats: {
          crawled_pages: result.totalPages,
          total_chunks: result.totalChunks,
          errors: result.errors,
          started_at: startedAt,
          completed_at: completedAt,
        },
      })
      .eq('id', agent_id);

    // Update crawl job
    if (crawl_job_id) {
      await supabase
        .from('crawl_jobs')
        .update({
          status: 'completed',
          completed_at: completedAt,
          total_urls_discovered: result.totalPages + result.skipped,
          total_urls_crawled: result.totalPages,
          total_urls_skipped: result.skipped,
          total_urls_failed: result.errors,
          total_chunks_created: result.totalChunks,
        })
        .eq('id', crawl_job_id);
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Mark as error
    await supabase
      .from('agents')
      .update({
        status: 'error',
        crawl_stats: {
          crawled_pages: totalPagesProcessed,
          total_chunks: totalChunksProcessed,
          errors: totalFailed + 1,
          error_message: errorMessage,
        },
      })
      .eq('id', agent_id);

    // Update crawl job
    if (crawl_job_id) {
      await supabase
        .from('crawl_jobs')
        .update({
          status: 'failed',
          error_message: errorMessage,
          completed_at: new Date().toISOString(),
        })
        .eq('id', crawl_job_id);
    }

    throw error;
  }
}

export function startCrawlWorker() {
  const worker = new Worker<CrawlJobData>('crawl', processCrawlJob, {
    connection: getRedisConnectionOpts(),
    concurrency: 2,
    limiter: {
      max: 2,
      duration: 1000,
    },
  });

  worker.on('completed', (job) => {
    console.log(`Crawl job ${job.id} completed`);
  });

  worker.on('failed', (job, error) => {
    console.error(`Crawl job ${job?.id} failed:`, error);
  });

  return worker;
}
