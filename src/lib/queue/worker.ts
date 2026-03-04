import { Worker, Job } from 'bullmq';
import { getRedisConnectionOpts } from './connection';
import { crawlWebsite, type CrawlResult } from '@/lib/crawler';
import { generateEmbedding } from '@/lib/gemini/embeddings';
import { createServiceClient } from '@/lib/supabase/server';
import type { CrawlJobData } from '@/types';

async function processCrawlJob(job: Job<CrawlJobData>) {
  const { agent_id, website_url } = job.data;
  const supabase = createServiceClient();

  // Update agent status to crawling
  await supabase
    .from('agents')
    .update({
      status: 'crawling',
      crawl_stats: { started_at: new Date().toISOString(), crawled_pages: 0, total_chunks: 0, errors: 0 },
    })
    .eq('id', agent_id);

  let totalPagesProcessed = 0;
  let totalChunksProcessed = 0;

  try {
    const result = await crawlWebsite(website_url, {
      onPageCrawled: async (crawlResult: CrawlResult) => {
        // Store page
        const { data: page } = await supabase
          .from('pages')
          .upsert(
            {
              agent_id,
              url: crawlResult.url,
              title: crawlResult.title,
              content: crawlResult.content,
              metadata: { description: crawlResult.description },
            },
            { onConflict: 'agent_id,url' }
          )
          .select('id')
          .single();

        if (!page) return;

        // Generate embeddings and store chunks
        for (const chunk of crawlResult.chunks) {
          try {
            const embedding = await generateEmbedding(chunk.content);

            await supabase.from('documents').insert({
              agent_id,
              page_id: page.id,
              content: chunk.content,
              metadata: chunk.metadata,
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
              started_at: job.data.website_url,
              crawled_pages: totalPagesProcessed,
              total_chunks: totalChunksProcessed,
              errors: 0,
            },
          })
          .eq('id', agent_id);
      },

      onProgress: (_crawled, _discovered, _currentUrl) => {
        // Progress updates handled in onPageCrawled
      },

      onError: (url, error) => {
        console.error(`Crawl error for ${url}: ${error}`);
      },
    });

    // Mark as ready
    await supabase
      .from('agents')
      .update({
        status: 'ready',
        crawl_stats: {
          crawled_pages: result.totalPages,
          total_chunks: result.totalChunks,
          errors: result.errors,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        },
      })
      .eq('id', agent_id);

    return result;
  } catch (error) {
    // Mark as error
    await supabase
      .from('agents')
      .update({
        status: 'error',
        crawl_stats: {
          crawled_pages: totalPagesProcessed,
          total_chunks: totalChunksProcessed,
          errors: 1,
          error_message: error instanceof Error ? error.message : 'Unknown error',
        },
      })
      .eq('id', agent_id);

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
