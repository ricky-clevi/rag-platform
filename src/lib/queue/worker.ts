import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { getRedisConnectionOpts } from './connection';
import { crawlWebsite, type CrawlResult } from '@/lib/crawler';
import { generateEmbeddingsBatch } from '@/lib/gemini/embeddings';
import { createServiceClient } from '@/lib/supabase/server';
import { recordUsageEvent, recordAuditLog } from '@/lib/usage-logger';
import { invalidateAgentCacheSimple } from '@/lib/rag/cache';
import { saveCheckpoint, clearCheckpoint } from '@/lib/crawler/checkpoint';
import { generateCompanyProfile, applyCompanyProfile } from '@/lib/rag/company-profiler';
import { CircuitBreaker } from '@/lib/crawler/circuit-breaker';
import type { CrawlJobData } from '@/types';
import { createHash } from 'crypto';

function chunkContentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Strip markdown formatting from chunk content for cleaner embedding vectors.
 * Prepends agent/page context for better semantic quality.
 * The original content is still stored in the database.
 */
function preprocessForEmbedding(content: string, agentName: string, pageTitle: string): string {
  const clean = content
    .replace(/#{1,6}\s/g, '') // Remove heading markers
    .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
    .replace(/\*(.*?)\*/g, '$1') // Remove italic
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove link markup
    .replace(/`([^`]+)`/g, '$1') // Remove inline code
    .trim();

  // Prepend context for better embedding quality
  return `${agentName} - ${pageTitle}: ${clean}`;
}

async function processCrawlJob(job: Job<CrawlJobData>) {
  const { agent_id, root_url, crawl_job_id, job_type, user_id } = job.data;
  const supabase = createServiceClient();

  const startedAt = new Date().toISOString();

  // Create Redis pub/sub client for real-time progress updates
  const pubClient = new Redis(getRedisConnectionOpts());

  // Fetch agent name for content preprocessing
  const { data: agentData } = await supabase
    .from('agents')
    .select('name')
    .eq('id', agent_id)
    .single();
  const agentName = agentData?.name || 'Agent';

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

  // Load allowed domains for domain-aware crawling (#6)
  const { data: agentDomains } = await supabase
    .from('agent_domains')
    .select('domain')
    .eq('agent_id', agent_id);
  const allowedDomains = (agentDomains || []).map((d: { domain: string }) => d.domain);

  // For incremental crawls, load existing page data
  let existingPages:
    | Map<string, { etag?: string; lastModified?: string; contentHash?: string }>
    | undefined;
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

  // For partial re-embedding (#27), load existing chunk hashes
  const existingChunkHashes = new Map<string, Map<string, string>>();
  if (job_type === 'incremental') {
    const { data: existingChunks } = await supabase
      .from('chunks')
      .select('id, page_id, content_hash')
      .eq('agent_id', agent_id);
    if (existingChunks) {
      for (const chunk of existingChunks) {
        if (!chunk.page_id) continue;
        if (!existingChunkHashes.has(chunk.page_id)) {
          existingChunkHashes.set(chunk.page_id, new Map());
        }
        if (chunk.content_hash) {
          existingChunkHashes.get(chunk.page_id)!.set(chunk.content_hash, chunk.id);
        }
      }
    }
  }

  // Record crawl start (#23, #24)
  recordUsageEvent({
    agent_id,
    event_type: 'crawl',
    metadata: { action: 'start', job_type, crawl_job_id },
  });
  recordAuditLog({
    user_id: user_id || null,
    agent_id,
    action: 'crawl_started',
    details: { job_type, crawl_job_id },
  });

  const circuitBreaker = new CircuitBreaker(10, 30000, (totalFailures) => {
    console.warn(`Circuit breaker opened for agent ${agent_id} after ${totalFailures} failures`);
  });

  try {
    const result = await crawlWebsite(
      root_url,
      {
        onPageCrawled: async (crawlResult: CrawlResult) => {
          // Save previous_markdown before overwriting (#26)
          const { data: existingPage } = await supabase
            .from('pages')
            .select('id, clean_markdown')
            .eq('agent_id', agent_id)
            .eq('url', crawlResult.url)
            .single();

          const previousMarkdown = existingPage?.clean_markdown || null;

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
                previous_markdown: previousMarkdown,
                raw_html_length: crawlResult.rawHtmlLength,
                page_type: crawlResult.pageType,
                crawl_status: 'crawled',
                skip_reason: null,
                last_crawled_at: new Date().toISOString(),
              },
              { onConflict: 'agent_id,url' }
            )
            .select('id')
            .single();

          if (!page) return;

          // Partial re-embedding (#27): only re-embed changed chunks
          const pageChunkHashes = existingChunkHashes.get(page.id);
          const unchangedChunkIds = new Set<string>();
          const newChunks: (typeof crawlResult.chunks[number] & { hash: string })[] = [];

          for (const chunk of crawlResult.chunks) {
            const hash = chunkContentHash(chunk.content);
            if (pageChunkHashes?.has(hash)) {
              unchangedChunkIds.add(pageChunkHashes.get(hash)!);
            } else {
              newChunks.push({ ...chunk, hash });
            }
          }

          // Delete only changed/removed chunks
          if (pageChunkHashes && pageChunkHashes.size > 0) {
            const { data: existingForPage } = await supabase
              .from('chunks')
              .select('id')
              .eq('page_id', page.id);
            const toDelete = (existingForPage || [])
              .filter((c) => !unchangedChunkIds.has(c.id))
              .map((c) => c.id);
            if (toDelete.length > 0) {
              await supabase.from('chunks').delete().in('id', toDelete);
            }
          } else {
            // Full crawl: delete all old chunks
            await supabase.from('chunks').delete().eq('page_id', page.id);
          }

          // Generate embeddings for new/changed chunks using BATCH embedding
          if (newChunks.length > 0) {
            const pageTitle = crawlResult.title || crawlResult.url;

            // Preprocess content for embedding (strip markdown, add context)
            // Original content is preserved in the database insert below
            const textsForEmbedding = newChunks.map((chunk) =>
              preprocessForEmbedding(chunk.content, agentName, pageTitle)
            );

            // BATCH embed all new chunks at once (instead of one-at-a-time)
            const { embeddings, failedIndices } =
              await generateEmbeddingsBatch(textsForEmbedding);

            const failedSet = new Set(failedIndices);

            // BATCH insert all successful chunks (instead of one-at-a-time)
            const chunksToInsert = newChunks
              .map((chunk, idx) => {
                if (failedSet.has(idx) || embeddings[idx].length === 0) return null;
                return {
                  agent_id,
                  page_id: page.id,
                  chunk_index: chunk.chunk_index,
                  heading_path: chunk.heading_path,
                  content: chunk.content, // Original content, NOT preprocessed
                  snippet: chunk.snippet,
                  language: crawlResult.language,
                  token_count: chunk.token_count,
                  rank_weight: 1.0,
                  content_hash: chunk.hash,
                  embedding: JSON.stringify(embeddings[idx]),
                };
              })
              .filter((c): c is NonNullable<typeof c> => c !== null);

            if (chunksToInsert.length > 0) {
              // Batch insert — Supabase supports array insert
              await supabase.from('chunks').insert(chunksToInsert);
              totalChunksProcessed += chunksToInsert.length;
            }

            if (failedIndices.length > 0) {
              console.warn(
                `${failedIndices.length} chunks failed to embed for ${crawlResult.url}`
              );
            }
          }

          totalChunksProcessed += unchangedChunkIds.size;
          totalPagesProcessed++;

          if (newChunks.length > 0) {
            recordUsageEvent({
              agent_id,
              event_type: 'embed',
              metadata: {
                page_url: crawlResult.url,
                new_chunks: newChunks.length,
                unchanged_chunks: unchangedChunkIds.size,
              },
            });
          }

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

          circuitBreaker.recordSuccess();

          // Save checkpoint every 10 pages for crash recovery
          if (totalPagesProcessed % 10 === 0) {
            await saveCheckpoint({
              agentId: agent_id,
              crawlJobId: crawl_job_id || '',
              visitedUrls: [],
              queuedUrls: [],
              totalPages: totalPagesProcessed,
              totalChunks: totalChunksProcessed,
              errors: totalFailed,
              skipped: totalSkipped,
              lastSavedAt: new Date().toISOString(),
            });
          }

          // Publish real-time progress via Redis pub/sub
          await pubClient
            .publish(
              `crawl:${agent_id}`,
              JSON.stringify({
                type: 'page_crawled',
                url: crawlResult.url,
                title: crawlResult.title,
                crawled_count: totalPagesProcessed,
                total_chunks: totalChunksProcessed,
                errors: totalFailed,
              })
            )
            .catch((err) => console.warn('Redis publish error:', err));
        },

        onProgress: (_crawled, _discovered, _currentUrl) => {
          // Progress updates handled in onPageCrawled
        },

        onError: async (url, error) => {
          totalFailed++;
          console.error(`Crawl error for ${url}: ${error}`);

          circuitBreaker.recordFailure();
          if (!circuitBreaker.canProceed()) {
            console.error(`Circuit breaker open for agent ${agent_id}, pausing crawl`);
          }

          // Store failed page record (#5)
          try {
            await supabase.from('pages').upsert(
              {
                agent_id,
                crawl_job_id: crawl_job_id || null,
                url,
                crawl_status: 'failed',
                skip_reason: error,
                last_crawled_at: new Date().toISOString(),
              },
              { onConflict: 'agent_id,url' }
            );
          } catch (dbError) {
            console.error(`Failed to record error page ${url}:`, dbError);
          }
        },

        onPageSkipped: async (url, reason) => {
          totalSkipped++;

          // Store skipped/blocked page record (#5)
          try {
            await supabase.from('pages').upsert(
              {
                agent_id,
                crawl_job_id: crawl_job_id || null,
                url,
                crawl_status: reason === 'robots.txt' ? 'blocked' : 'skipped',
                skip_reason: reason,
                last_crawled_at: new Date().toISOString(),
              },
              { onConflict: 'agent_id,url' }
            );
          } catch (dbError) {
            console.error(`Failed to record skipped page ${url}:`, dbError);
          }
        },
      },
      { existingPages, jobType: job_type, allowedDomains }
    );

    const completedAt = new Date().toISOString();

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

    recordUsageEvent({
      agent_id,
      event_type: 'crawl',
      metadata: {
        action: 'complete',
        job_type,
        total_pages: result.totalPages,
        total_chunks: result.totalChunks,
        errors: result.errors,
        skipped: result.skipped,
      },
    });

    recordAuditLog({
      user_id: user_id || null,
      agent_id,
      action: 'crawl_completed',
      details: {
        job_type,
        total_pages: result.totalPages,
        total_chunks: result.totalChunks,
      },
    });

    // Generate company profile for full crawls (runs in background, non-blocking)
    if (job_type !== 'incremental' && result.totalPages > 0) {
      generateCompanyProfile(agent_id)
        .then((profile) => profile && applyCompanyProfile(agent_id, profile))
        .catch((err) => console.warn('Company profile generation failed:', err));
    }

    // Clear checkpoint on successful completion
    await clearCheckpoint(agent_id);

    // Invalidate response cache so new crawled data is immediately used
    await invalidateAgentCacheSimple(agent_id);

    // Publish completion event via Redis pub/sub
    await pubClient
      .publish(
        `crawl:${agent_id}`,
        JSON.stringify({
          type: 'completed',
          total_pages: result.totalPages,
          total_chunks: result.totalChunks,
        })
      )
      .catch((err) => console.warn('Redis publish error:', err));

    // Clean up Redis pub/sub client
    await pubClient.quit().catch(() => {});

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

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

    recordAuditLog({
      user_id: user_id || null,
      agent_id,
      action: 'crawl_failed',
      details: { error: errorMessage },
    });

    // Publish error event via Redis pub/sub
    await pubClient
      .publish(
        `crawl:${agent_id}`,
        JSON.stringify({
          type: 'error',
          error: errorMessage,
        })
      )
      .catch((err) => console.warn('Redis publish error:', err));

    // Clean up Redis pub/sub client
    await pubClient.quit().catch(() => {});

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
    lockDuration: 1800000, // 30 minutes max per job
  });

  worker.on('completed', (job) => {
    console.log(`Crawl job ${job.id} completed`);
  });

  worker.on('failed', (job, error) => {
    console.error(`Crawl job ${job?.id} failed:`, error);
  });

  return worker;
}
