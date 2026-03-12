import { load } from 'cheerio';
import { normalizeUrl, extractDomain, isInDomainScope, shouldSkipUrl } from '@/lib/utils/url';
import type { CrawlJob, CrawlJobMetrics, JobStage } from '@/types';
import { generateQueryEmbedding } from '@/lib/gemini/embeddings';
import type { SupabaseClient } from '@supabase/supabase-js';

interface SearchRpcResult {
  content: string;
  heading_path: string | null;
  page_id: string | null;
  similarity: number | null;
  combined_score: number | null;
}

export interface DataMapResult {
  rootUrl: string;
  domain: string;
  urls: string[];
  discoveredCount: number;
  hasSitemap: boolean;
  crawlAllowed: boolean;
  pathGroups: Array<{
    prefix: string;
    count: number;
    samples: string[];
  }>;
}

function matchesPathPatterns(url: string, patterns: string[]): boolean {
  if (!patterns || patterns.length === 0) return true;
  try {
    const urlPath = new URL(url).pathname;
    return patterns.some((pattern) => {
      const regexPattern = pattern
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.')
        .replace(/\//g, '\\/');
      return new RegExp(`^${regexPattern}`).test(urlPath);
    });
  } catch {
    return false;
  }
}

function groupUrlsByPathPrefix(urls: string[]) {
  const groups = new Map<string, string[]>();

  for (const url of urls) {
    try {
      const pathname = new URL(url).pathname;
      const firstSegment = pathname.split('/').filter(Boolean)[0];
      const prefix = firstSegment ? `/${firstSegment}` : '/';
      const group = groups.get(prefix) || [];
      group.push(url);
      groups.set(prefix, group);
    } catch {
      const group = groups.get('/') || [];
      group.push(url);
      groups.set('/', group);
    }
  }

  return [...groups.entries()]
    .map(([prefix, samples]) => ({
      prefix,
      count: samples.length,
      samples: samples.slice(0, 5),
    }))
    .sort((a, b) => b.count - a.count);
}

async function fetchText(url: string, timeoutMs = 8000): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AgentForgeBot/1.0)' },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    });

    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

function parseSitemapUrls(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*(.*?)\s*<\/loc>/gi)].map((match) => match[1].trim());
}

export async function mapSiteUrls(
  url: string,
  options: { includePaths?: string[]; excludePaths?: string[] } = {}
): Promise<DataMapResult> {
  const rootUrl = normalizeUrl(url);
  const domain = extractDomain(rootUrl);
  const discovered = new Set<string>([rootUrl]);
  const includePaths = options.includePaths || [];
  const excludePaths = options.excludePaths || [];

  const [homepageHtml, robotsTxt, sitemapXml] = await Promise.all([
    fetchText(rootUrl, 10000),
    fetchText(new URL('/robots.txt', rootUrl).toString(), 5000),
    fetchText(new URL('/sitemap.xml', rootUrl).toString(), 5000),
  ]);

  const crawlAllowed = !robotsTxt || !/disallow:\s*\/\s*$/im.test(robotsTxt);
  const hasSitemap = Boolean(sitemapXml);

  if (sitemapXml) {
    for (const sitemapUrl of parseSitemapUrls(sitemapXml)) {
      const normalized = normalizeUrl(sitemapUrl);
      if (!shouldSkipUrl(normalized, { allowPdf: true }) && isInDomainScope(normalized, rootUrl)) {
        discovered.add(normalized);
      }
    }
  }

  if (homepageHtml) {
    const $ = load(homepageHtml);
    $('a[href]').each((_index, element) => {
      const href = $(element).attr('href');
      if (!href) return;

      try {
        const normalized = normalizeUrl(new URL(href, rootUrl).toString());
        if (!shouldSkipUrl(normalized, { allowPdf: true }) && isInDomainScope(normalized, rootUrl)) {
          discovered.add(normalized);
        }
      } catch {
        // Ignore malformed links
      }
    });
  }

  const filteredUrls = [...discovered]
    .filter((candidate) => {
      const inInclude = !includePaths.length || matchesPathPatterns(candidate, includePaths);
      const notExcluded = !excludePaths.length || !matchesPathPatterns(candidate, excludePaths);
      return inInclude && notExcluded;
    })
    .sort();
  const urls = filteredUrls.slice(0, 200);

  return {
    rootUrl,
    domain,
    urls,
    discoveredCount: filteredUrls.length,
    hasSitemap,
    crawlAllowed,
    pathGroups: groupUrlsByPathPrefix(urls),
  };
}

export async function searchAgentKnowledge(
  supabase: SupabaseClient,
  agentId: string,
  query: string,
  matchCount = 8
) {
  const queryEmbedding = await generateQueryEmbedding(query);
  const { data: results } = await supabase.rpc('hybrid_search', {
    query_embedding: JSON.stringify(queryEmbedding),
    query_text: query,
    match_agent_id: agentId,
    match_count: matchCount,
    semantic_weight: 0.7,
    keyword_weight: 0.3,
  });

  const pageIds = [...new Set(
    ((results as SearchRpcResult[] | null) || [])
      .filter((result) => result.page_id)
      .map((result) => result.page_id as string)
  )];

  const { data: pages } = pageIds.length > 0
    ? await supabase.from('pages').select('id, url, title').in('id', pageIds)
    : { data: [] };

  const pageMap = new Map(
    (pages || []).map((page: { id: string; url: string; title: string | null }) => [
      page.id,
      { url: page.url, title: page.title },
    ])
  );

  return ((results as SearchRpcResult[] | null) || []).map((result) => ({
    content: result.content,
    heading_path: result.heading_path || '',
    page_id: result.page_id,
    page_url: result.page_id ? pageMap.get(result.page_id)?.url || '' : '',
    page_title: result.page_id ? pageMap.get(result.page_id)?.title || '' : '',
    similarity: result.similarity || 0,
    combined_score: result.combined_score || 0,
  }));
}

export function computeCrawlJobMetrics(
  job: Partial<CrawlJob> | null,
  crawlStats?: Record<string, unknown> | null
): CrawlJobMetrics {
  const discovered = Number(job?.total_urls_discovered || crawlStats?.discovered_urls || crawlStats?.total_pages || 0);
  const crawled = Number(job?.total_urls_crawled || crawlStats?.crawled_pages || 0);
  const completedAt = typeof crawlStats?.completed_at === 'string' ? Date.parse(crawlStats.completed_at) : null;
  const startedAt = typeof crawlStats?.started_at === 'string' ? Date.parse(crawlStats.started_at) : null;
  const elapsedMinutes =
    startedAt && !Number.isNaN(startedAt)
      ? ((completedAt && !Number.isNaN(completedAt) ? completedAt : Date.now()) - startedAt) / 60000
      : 0;
  const pagesPerMinute =
    typeof crawlStats?.pages_per_minute === 'number'
      ? crawlStats.pages_per_minute
      : elapsedMinutes > 0.1
        ? Math.round(crawled / elapsedMinutes)
        : 0;

  const etaSeconds =
    typeof crawlStats?.eta_seconds === 'number'
      ? crawlStats.eta_seconds
      : discovered > crawled && pagesPerMinute > 0
        ? Math.round(((discovered - crawled) / pagesPerMinute) * 60)
        : null;

  const stage = (
    (typeof crawlStats?.current_stage === 'string' ? crawlStats.current_stage : undefined)
    || (job?.status === 'completed'
      ? 'ready'
      : job?.status === 'failed'
        ? 'failed'
        : job?.status === 'queued'
          ? 'queued'
          : 'discovering')
  ) as JobStage;

  return {
    discovered_urls: discovered,
    crawled_urls: crawled,
    failed_urls: Number(job?.total_urls_failed || crawlStats?.errors || 0),
    skipped_urls: Number(job?.total_urls_skipped || 0),
    total_chunks: Number(job?.total_chunks_created || crawlStats?.total_chunks || 0),
    pages_per_minute: pagesPerMinute,
    browser_render_share: Number(crawlStats?.browser_render_share || 0),
    embed_queue_depth: Number(crawlStats?.embed_queue_depth || 0),
    changed_page_count: Number(crawlStats?.changed_pages || 0),
    changed_pages: Number(crawlStats?.changed_pages || 0),
    eta_seconds: etaSeconds,
    eta_minutes: etaSeconds == null ? null : Math.ceil(etaSeconds / 60),
    failure_reason:
      typeof job?.error_message === 'string'
        ? job.error_message
        : typeof crawlStats?.error_message === 'string'
          ? crawlStats.error_message
          : null,
    current_stage: stage,
  };
}
