import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { getRedisConnectionOpts } from './connection';
import { crawlWebsite, type CrawlResult } from '@/lib/crawler';
import { DEFAULT_CHAT_MODEL, tryGetGeminiClient } from '@/lib/gemini/client';
import { generateEmbeddingsBatch } from '@/lib/gemini/embeddings';
import { createServiceClient } from '@/lib/supabase/server';
import { recordUsageEvent, recordAuditLog } from '@/lib/usage-logger';
import { invalidateAgentCacheSimple } from '@/lib/rag/cache';
import { saveCheckpoint, clearCheckpoint } from '@/lib/crawler/checkpoint';
import {
  applyCompanyProfile,
  buildProfilePseudoChunks,
  generateCompanyProfile,
  type CompanyProfile,
} from '@/lib/rag/company-profiler';
import { CircuitBreaker } from '@/lib/crawler/circuit-breaker';
import { sanitizeCrawlStealthOptions } from '@/lib/crawler/stealth';
import type { CrawlJobData } from '@/types';
import { createHash } from 'crypto';

/**
 * Create a Redis pub/sub client for real-time progress updates.
 * Returns null if Redis is unavailable (direct execution mode).
 */
async function tryCreatePubClient(): Promise<Redis | null> {
  try {
    const client = new Redis({
      ...getRedisConnectionOpts(),
      lazyConnect: true,
      connectTimeout: 3000,
      maxRetriesPerRequest: 1,
    });
    await client.connect();
    return client;
  } catch {
    return null;
  }
}

function chunkContentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function cleanChunkContent(content: string): string {
  return content
    .replace(/#{1,6}\s/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

/**
 * Strip markdown formatting from chunk content for cleaner embedding vectors.
 * Prepends synopsis/heading context for better embedding quality.
 * The original content is still stored in the database.
 */
function preprocessForEmbedding(content: string, contextPrefix: string): string {
  const clean = cleanChunkContent(content);
  return contextPrefix ? `${contextPrefix}\n\n${clean}` : clean;
}

function buildChunkContextPrefix(
  synopsis: string | null,
  pageTitle: string,
  headingPath: string | null
): string {
  const prefixParts = [synopsis || '', pageTitle ? `Page: ${pageTitle}` : '', headingPath ? `Section: ${headingPath}` : '']
    .map((value) => value.trim())
    .filter(Boolean);
  return prefixParts.join('\n');
}

function computeDiffSize(previousMarkdown: string, nextMarkdown: string): number {
  const previousLines = previousMarkdown.split('\n').map((line) => line.trim());
  const nextLines = nextMarkdown.split('\n').map((line) => line.trim());
  const previousSet = new Set(previousLines.filter(Boolean));
  const nextSet = new Set(nextLines.filter(Boolean));
  let changed = 0;

  for (const line of nextSet) {
    if (!previousSet.has(line)) changed++;
  }
  for (const line of previousSet) {
    if (!nextSet.has(line)) changed++;
  }

  return changed;
}

function calculatePagesPerMinute(startedAt: string, processedCount: number): number {
  const startedAtMs = new Date(startedAt).getTime();
  if (!Number.isFinite(startedAtMs)) return 0;

  const elapsedMinutes = Math.max((Date.now() - startedAtMs) / 60_000, 0);
  if (elapsedMinutes <= 0 || processedCount <= 0) {
    return 0;
  }

  return Math.max(1, Math.round(processedCount / elapsedMinutes));
}

function buildLiveCrawlProgress(params: {
  startedAt: string;
  crawledPages: number;
  processedUrls: number;
  discoveredUrls: number;
  totalChunks: number;
  errors: number;
  skipped: number;
  changedPages: number;
  stage: 'discovering' | 'fetching' | 'embedding' | 'ready' | 'failed';
}) {
  const pagesPerMinute = calculatePagesPerMinute(params.startedAt, params.processedUrls);
  const remainingUrls = Math.max(params.discoveredUrls - params.processedUrls, 0);
  const etaSeconds =
    pagesPerMinute > 0 && remainingUrls > 0
      ? Math.ceil((remainingUrls / pagesPerMinute) * 60)
      : null;

  return {
    crawlStats: {
      started_at: params.startedAt,
      crawled_pages: params.crawledPages,
      total_chunks: params.totalChunks,
      errors: params.errors,
      changed_pages: params.changedPages,
      discovered_urls: params.discoveredUrls,
      pages_per_minute: pagesPerMinute,
      eta_seconds: etaSeconds,
      current_stage: params.stage,
    },
    crawlJob: {
      total_urls_discovered: params.discoveredUrls,
      total_urls_crawled: params.crawledPages,
      total_urls_skipped: params.skipped,
      total_urls_failed: params.errors,
      total_chunks_created: params.totalChunks,
    },
    event: {
      crawled_count: params.crawledPages,
      processed_count: params.processedUrls,
      total_discovered: params.discoveredUrls,
      chunks_created: params.totalChunks,
      errors: params.errors,
      skipped_count: params.skipped,
      changed_pages: params.changedPages,
      pages_per_minute: pagesPerMinute,
      eta_seconds: etaSeconds,
      started_at: params.startedAt,
      current_stage: params.stage,
    },
  };
}

async function summarizePageSynopsis(
  agentName: string,
  pageTitle: string,
  url: string,
  markdown: string
): Promise<string | null> {
  try {
    const client = tryGetGeminiClient();
    if (!client) return null;

    const result = await Promise.race([
      client.models.generateContent({
        model: DEFAULT_CHAT_MODEL,
        contents: `Summarize this page in 2-3 sentences: what company, what section, and what topics are covered.

Company: ${agentName}
Page title: ${pageTitle}
URL: ${url}

Content:
${markdown.slice(0, 6000)}`,
        config: {
          temperature: 0.1,
          maxOutputTokens: 220,
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Page synopsis timed out')), 15_000)
      ),
    ]);

    return (result.text || '').trim() || null;
  } catch {
    return null;
  }
}

async function summarizePageChange(
  url: string,
  previousMarkdown: string,
  nextMarkdown: string
): Promise<{ changed_at: string; summary: string; diff_size: number }> {
  const diffSize = computeDiffSize(previousMarkdown, nextMarkdown);

  try {
    const client = tryGetGeminiClient();
    if (!client) {
      return {
        changed_at: new Date().toISOString(),
        summary: 'Content changed between crawls.',
        diff_size: diffSize,
      };
    }

    const result = await Promise.race([
      client.models.generateContent({
        model: DEFAULT_CHAT_MODEL,
        contents: `Summarize what changed between the previous and current versions of this page in 2-3 sentences.

URL: ${url}

Previous version:
${previousMarkdown.slice(0, 4000)}

Current version:
${nextMarkdown.slice(0, 4000)}`,
        config: {
          temperature: 0.1,
          maxOutputTokens: 220,
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Change summary timed out')), 15_000)
      ),
    ]);

    return {
      changed_at: new Date().toISOString(),
      summary: (result.text || '').trim() || 'Content changed between crawls.',
      diff_size: diffSize,
    };
  } catch {
    return {
      changed_at: new Date().toISOString(),
      summary: 'Content changed between crawls.',
      diff_size: diffSize,
    };
  }
}

function parseEmbeddingVector(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is number => typeof entry === 'number');
  }

  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as number[];
    } catch {
      return value
        .replace(/^\[|\]$/g, '')
        .split(',')
        .map((entry) => Number(entry.trim()))
        .filter((entry) => Number.isFinite(entry));
    }
  }

  return [];
}

function averageEmbeddings(vectors: number[][]): number[] {
  if (vectors.length === 0) return [];
  const dimensions = vectors[0].length;
  const totals = new Array(dimensions).fill(0);

  for (const vector of vectors) {
    if (vector.length !== dimensions) continue;
    for (let i = 0; i < dimensions; i++) {
      totals[i] += vector[i];
    }
  }

  return totals.map((value) => value / vectors.length);
}

async function updateAgentEmbedding(supabase: ReturnType<typeof createServiceClient>, agentId: string) {
  const { data: chunkEmbeddings } = await supabase
    .from('chunks')
    .select('embedding')
    .eq('agent_id', agentId);

  const vectors = (chunkEmbeddings || [])
    .map((row) => parseEmbeddingVector((row as { embedding?: unknown }).embedding))
    .filter((vector) => vector.length > 0);

  if (vectors.length === 0) {
    return;
  }

  const average = averageEmbeddings(vectors);
  if (average.length === 0) {
    return;
  }

  await supabase
    .from('agents')
    .update({ embedding: JSON.stringify(average) })
    .eq('id', agentId);
}

async function upsertProfilePseudoChunks(
  supabase: ReturnType<typeof createServiceClient>,
  agentId: string,
  profile: CompanyProfile,
  defaultLanguage: string
) {
  const pseudoChunks = buildProfilePseudoChunks(profile);
  await supabase
    .from('chunks')
    .delete()
    .eq('agent_id', agentId)
    .like('heading_path', 'Extracted:%');

  if (pseudoChunks.length === 0) {
    return;
  }

  const textsForEmbedding = pseudoChunks.map((chunk) =>
    preprocessForEmbedding(chunk.content, chunk.contextPrefix)
  );
  const { embeddings, failedIndices } = await generateEmbeddingsBatch(textsForEmbedding);
  const failedSet = new Set(failedIndices);

  const rows = pseudoChunks
    .map((chunk, index) => {
      if (failedSet.has(index) || embeddings[index].length === 0) {
        return null;
      }

      return {
        agent_id: agentId,
        page_id: chunk.pageId,
        chunk_index: 100_000 + index,
        heading_path: chunk.headingPath,
        content: chunk.content,
        snippet: chunk.content.slice(0, 180),
        language: defaultLanguage || 'en',
        token_count: chunk.content.split(/\s+/).filter(Boolean).length,
        rank_weight: 1.05,
        quality_score: 1.0,
        content_hash: chunkContentHash(chunk.content),
        context_prefix: chunk.contextPrefix,
        embedding: JSON.stringify(embeddings[index]),
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (rows.length > 0) {
    await supabase.from('chunks').insert(rows);
  }
}

/**
 * Core crawl job execution logic, decoupled from BullMQ.
 * Can be called directly (without Redis) or from the BullMQ worker.
 */
export async function executeCrawlJob(data: CrawlJobData) {
  const { agent_id, root_url, crawl_job_id, job_type, user_id, max_depth, max_pages, include_paths, exclude_paths, ignore_robots } = data;
  console.log(`[crawl] Starting job for ${root_url} | ignore_robots=${ignore_robots} | max_depth=${max_depth} | max_pages=${max_pages}`);
  const supabase = createServiceClient();

  const startedAt = new Date().toISOString();

  // Create Redis pub/sub client for real-time progress updates (optional)
  const pubClient = await tryCreatePubClient();

  // Fetch agent settings for content preprocessing and crawl options
  const [{ data: agentData }, { data: settingsData }] = await Promise.all([
    supabase
    .from('agents')
      .select('name, primary_locale')
      .eq('id', agent_id)
      .single(),
    supabase
      .from('agent_settings')
      .select('crawl_options')
      .eq('agent_id', agent_id)
      .single(),
  ]);
  const agentName = agentData?.name || 'Agent';
  const agentLocale = agentData?.primary_locale || 'en';
  const crawlOptions = sanitizeCrawlStealthOptions(
    (settingsData as { crawl_options?: unknown } | null)?.crawl_options as Record<string, unknown> | null
  );

  let totalPagesProcessed = 0;
  let totalChunksProcessed = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  let totalChangedPages = 0;
  let totalDiscovered = 1;
  let totalProcessed = 0;
  let lastProgressPersistAt = 0;

  const getLiveProgressSnapshot = (
    stage: 'discovering' | 'fetching' | 'embedding' | 'ready' | 'failed'
  ) =>
    buildLiveCrawlProgress({
      startedAt,
      crawledPages: totalPagesProcessed,
      processedUrls: totalProcessed,
      discoveredUrls: Math.max(totalDiscovered, totalProcessed, totalPagesProcessed),
      totalChunks: totalChunksProcessed,
      errors: totalFailed,
      skipped: totalSkipped,
      changedPages: totalChangedPages,
      stage,
    });

  const persistLiveProgress = async (
    stage: 'discovering' | 'fetching' | 'embedding' | 'ready' | 'failed',
    force = false
  ) => {
    const now = Date.now();
    if (!force && now - lastProgressPersistAt < 1_500) {
      return;
    }

    lastProgressPersistAt = now;
    const snapshot = getLiveProgressSnapshot(stage);

    await supabase
      .from('agents')
      .update({ crawl_stats: snapshot.crawlStats })
      .eq('id', agent_id);

    if (crawl_job_id) {
      await supabase
        .from('crawl_jobs')
        .update(snapshot.crawlJob)
        .eq('id', crawl_job_id);
    }
  };

  const publishLiveEvent = async (
    type: 'progress' | 'page_crawled' | 'error_page' | 'completed' | 'failed',
    extras: Record<string, unknown> = {}
  ) => {
    const stage =
      type === 'completed'
        ? 'ready'
        : type === 'failed'
          ? 'failed'
          : 'fetching';
    const snapshot = getLiveProgressSnapshot(stage);

    await pubClient
      ?.publish(
        `crawl:${agent_id}`,
        JSON.stringify({
          type,
          ...snapshot.event,
          ...extras,
        })
      )
      .catch((err) => console.warn('Redis publish error:', err));
  };

  // Update agent status to crawling
  await supabase
    .from('agents')
    .update({
      status: 'crawling',
      crawl_stats: getLiveProgressSnapshot('discovering').crawlStats,
    })
    .eq('id', agent_id);

  // Update crawl job status
  if (crawl_job_id) {
    await supabase
      .from('crawl_jobs')
      .update({
        status: 'running',
        started_at: startedAt,
        ...getLiveProgressSnapshot('discovering').crawlJob,
      })
      .eq('id', crawl_job_id);
  }

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
      .select('id, page_id, content_hash, heading_path')
      .eq('agent_id', agent_id);
    if (existingChunks) {
      for (const chunk of existingChunks) {
        if (chunk.heading_path?.startsWith('Extracted:')) continue;
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
          const { data: existingPage, error: existingPageError } = await supabase
            .from('pages')
            .select('id, clean_markdown, synopsis, change_summary')
            .eq('agent_id', agent_id)
            .eq('url', crawlResult.url)
            .single();

          if (existingPageError && existingPageError.code !== 'PGRST116') {
            throw new Error(`Failed to load existing page ${crawlResult.url}: ${existingPageError.message}`);
          }

          const previousMarkdown = existingPage?.clean_markdown || null;
          const pageContentChanged = Boolean(
            previousMarkdown && previousMarkdown !== crawlResult.content
          );
          const synopsis =
            !existingPage?.synopsis || pageContentChanged
              ? await summarizePageSynopsis(
                  agentName,
                  crawlResult.title || crawlResult.url,
                  crawlResult.url,
                  crawlResult.content
                )
              : existingPage.synopsis;
          const changeSummary = pageContentChanged
            ? await summarizePageChange(crawlResult.url, previousMarkdown!, crawlResult.content)
            : existingPage?.change_summary || null;

          if (pageContentChanged) {
            totalChangedPages++;
          }

          // Store/update page
          const { data: page, error: pageUpsertError } = await supabase
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
                synopsis,
                change_summary: changeSummary,
                extraction_method: crawlResult.extractionMethod || 'readability',
                structured_data: crawlResult.structuredData || {},
                raw_html_length: crawlResult.rawHtmlLength,
                page_type: crawlResult.pageType,
                crawl_status: 'crawled',
                skip_reason: null,
                last_crawled_at: new Date().toISOString(),
              },
              { onConflict: 'agent_id,url' }
            )
            .select('id, synopsis')
            .single();

          if (pageUpsertError) {
            throw new Error(`Failed to store page ${crawlResult.url}: ${pageUpsertError.message}`);
          }

          if (!page) {
            throw new Error(`Failed to store page ${crawlResult.url}: page upsert returned no row`);
          }

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
            try {
              const pageTitle = crawlResult.title || crawlResult.url;
              const pageSynopsis = (page as { synopsis?: string | null }).synopsis || synopsis || null;
              const contextPrefixes = newChunks.map((chunk) =>
                buildChunkContextPrefix(pageSynopsis, pageTitle, chunk.heading_path || null)
              );

              // Preprocess content for embedding (strip markdown, add context)
              // Original content is preserved in the database insert below
              const textsForEmbedding = newChunks.map((chunk, idx) =>
                preprocessForEmbedding(chunk.content, contextPrefixes[idx])
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
                    quality_score: 1.0,
                    content_hash: chunk.hash,
                    context_prefix: contextPrefixes[idx],
                    embedding: JSON.stringify(embeddings[idx]),
                  };
                })
                .filter((c): c is NonNullable<typeof c> => c !== null);

              if (chunksToInsert.length > 0) {
                // Batch insert — Supabase supports array insert
                const { error: insertError } = await supabase.from('chunks').insert(chunksToInsert);
                if (insertError) {
                  console.error(
                    `Failed to insert ${chunksToInsert.length} chunks for ${crawlResult.url}: ${insertError.message}`
                  );
                  totalFailed++;
                } else {
                  totalChunksProcessed += chunksToInsert.length;
                }
              }

              if (failedIndices.length > 0) {
                console.warn(
                  `${failedIndices.length} chunks failed to embed for ${crawlResult.url}`
                );
              }
            } catch (embedError) {
              console.error(`Embedding failed for ${crawlResult.url}:`, embedError instanceof Error ? embedError.message : embedError);
              totalFailed++;
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

          await publishLiveEvent('page_crawled', {
            url: crawlResult.url,
            title: crawlResult.title,
            total_chunks: totalChunksProcessed,
          });
        },

        onProgress: async (processedCount, discoveredCount) => {
          totalProcessed = Math.max(totalProcessed, processedCount);
          totalDiscovered = Math.max(totalDiscovered, discoveredCount, totalProcessed);

          await publishLiveEvent('progress');
          await persistLiveProgress('fetching');
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

          await publishLiveEvent('error_page', {
            url,
            error,
          });
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

          if (reason === 'robots.txt' || reason === 'excluded_pattern') {
            totalProcessed++;
            totalDiscovered = Math.max(totalDiscovered, totalProcessed);
            await publishLiveEvent('progress');
            await persistLiveProgress('fetching');
          }
        },
      },
      {
        existingPages,
        jobType: job_type,
        allowedDomains,
        max_depth,
        max_pages,
        include_paths,
        exclude_paths,
        ignore_robots,
        crawlOptions,
      }
    );

    const completedAt = new Date().toISOString();
    totalProcessed = Math.max(totalProcessed, totalPagesProcessed + totalSkipped + totalFailed);
    totalDiscovered = Math.max(totalDiscovered, totalProcessed);
    await persistLiveProgress('embedding', true);

    const totalPagesFinal = totalPagesProcessed;
    const totalErrorsFinal = totalFailed;
    const totalDiscoveredFinal = Math.max(totalDiscovered, totalProcessed);

    if (totalPagesFinal > 0) {
      try {
        const profile = await generateCompanyProfile(agent_id);
        if (profile) {
          await applyCompanyProfile(agent_id, profile);
          await upsertProfilePseudoChunks(supabase, agent_id, profile, agentLocale);
        }
      } catch (err) {
        console.warn('Company profile generation failed:', err);
      }
    }

    await updateAgentEmbedding(supabase, agent_id);
    const { count: finalChunkCount } = await supabase
      .from('chunks')
      .select('*', { count: 'exact', head: true })
      .eq('agent_id', agent_id);
    const totalChunksFinal = finalChunkCount ?? result.totalChunks;
    const completedSnapshot = buildLiveCrawlProgress({
      startedAt,
      crawledPages: totalPagesFinal,
      processedUrls: totalDiscoveredFinal,
      discoveredUrls: totalDiscoveredFinal,
      totalChunks: totalChunksFinal,
      errors: totalErrorsFinal,
      skipped: totalSkipped,
      changedPages: totalChangedPages,
      stage: 'ready',
    });

    await supabase
      .from('agents')
      .update({
        status: 'ready',
        crawl_stats: {
          ...completedSnapshot.crawlStats,
          completed_at: completedAt,
          eta_seconds: 0,
        },
      })
      .eq('id', agent_id);

    if (crawl_job_id) {
      await supabase
        .from('crawl_jobs')
        .update({
          status: 'completed',
          completed_at: completedAt,
          ...completedSnapshot.crawlJob,
        })
        .eq('id', crawl_job_id);
    }

    recordUsageEvent({
      agent_id,
      event_type: 'crawl',
      metadata: {
        action: 'complete',
        job_type,
        total_pages: totalPagesFinal,
        total_chunks: totalChunksFinal,
        errors: totalErrorsFinal,
        skipped: totalSkipped,
        changed_pages: totalChangedPages,
      },
    });

    recordAuditLog({
      user_id: user_id || null,
      agent_id,
      action: 'crawl_completed',
      details: {
        job_type,
        total_pages: totalPagesFinal,
        total_chunks: totalChunksFinal,
      },
    });

    // Clear checkpoint on successful completion
    await clearCheckpoint(agent_id);

    // Invalidate response cache so new crawled data is immediately used
    await invalidateAgentCacheSimple(agent_id);

    // Publish completion event via Redis pub/sub
    await pubClient
      ?.publish(
        `crawl:${agent_id}`,
        JSON.stringify({
          type: 'completed',
          ...completedSnapshot.event,
          total_pages: totalPagesFinal,
          total_chunks: totalChunksFinal,
          eta_seconds: 0,
        })
      )
      .catch((err) => console.warn('Redis publish error:', err));

    // Clean up Redis pub/sub client
    await pubClient?.quit().catch(() => {});

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    totalProcessed = Math.max(totalProcessed, totalPagesProcessed + totalSkipped + totalFailed);
    totalDiscovered = Math.max(totalDiscovered, totalProcessed);
    const failedSnapshot = buildLiveCrawlProgress({
      startedAt,
      crawledPages: totalPagesProcessed,
      processedUrls: totalProcessed,
      discoveredUrls: totalDiscovered,
      totalChunks: totalChunksProcessed,
      errors: totalFailed + 1,
      skipped: totalSkipped,
      changedPages: totalChangedPages,
      stage: 'failed',
    });

    await supabase
      .from('agents')
      .update({
        status: 'error',
        crawl_stats: {
          ...failedSnapshot.crawlStats,
          error_message: errorMessage,
        },
      })
      .eq('id', agent_id);

    if (crawl_job_id) {
      await supabase
        .from('crawl_jobs')
        .update({
          status: 'failed',
          ...failedSnapshot.crawlJob,
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
      ?.publish(
        `crawl:${agent_id}`,
        JSON.stringify({
          type: 'error',
          ...failedSnapshot.event,
          error: errorMessage,
        })
      )
      .catch((err) => console.warn('Redis publish error:', err));

    // Clean up Redis pub/sub client
    await pubClient?.quit().catch(() => {});

    throw error;
  }
}

async function processCrawlJob(job: Job<CrawlJobData>) {
  return executeCrawlJob(job.data);
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
