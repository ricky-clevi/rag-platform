import { createHash } from 'crypto';
import robotsParser from 'robots-parser';
import { crawlPageHttp } from './http-crawler';
import { crawlPageBrowser } from './browser-crawler';
import { chunkText, type TextChunk } from './chunker';
import { normalizeUrl, isSameDomain, shouldSkipUrl } from '@/lib/utils/url';

export interface CrawlResult {
  url: string;
  canonicalUrl: string | null;
  title: string;
  content: string;
  language: string;
  chunks: TextChunk[];
  etag: string | null;
  lastModified: string | null;
  statusCode: number;
  rawHtmlLength: number;
  contentHash: string;
  pageType: 'html' | 'pdf' | 'other';
  robotsAllowed: boolean;
}

export interface CrawlCallbacks {
  onPageCrawled: (result: CrawlResult) => Promise<void>;
  onProgress: (crawled: number, discovered: number, currentUrl: string) => void;
  onError: (url: string, error: string) => void;
  onPageSkipped?: (url: string, reason: string) => void;
}

export interface CrawlOptions {
  /** Existing page data for incremental recrawls */
  existingPages?: Map<string, { etag?: string; lastModified?: string; contentHash?: string }>;
  jobType?: 'full' | 'incremental' | 'single_page';
}

const USER_AGENT = 'AgentForgeBot';

function computeContentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

async function fetchRobotsTxt(baseUrl: string) {
  try {
    const robotsUrl = new URL('/robots.txt', baseUrl).toString();
    const response = await fetch(robotsUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) {
      const text = await response.text();
      return robotsParser(robotsUrl, text);
    }
  } catch {
    // If robots.txt is not available, allow all
  }
  return null;
}

async function discoverSitemapUrls(baseUrl: string): Promise<string[]> {
  const urls: string[] = [];
  const sitemapPaths = ['/sitemap.xml', '/sitemap_index.xml', '/sitemap.txt'];

  for (const path of sitemapPaths) {
    try {
      const sitemapUrl = new URL(path, baseUrl).toString();
      const response = await fetch(sitemapUrl, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) continue;
      const text = await response.text();

      if (path.endsWith('.txt')) {
        // Plain text sitemap: one URL per line
        const lines = text.split('\n').filter((l) => l.trim().startsWith('http'));
        urls.push(...lines.map((l) => l.trim()));
      } else {
        // XML sitemap — extract <loc> tags
        const locMatches = text.matchAll(/<loc>\s*(.*?)\s*<\/loc>/gi);
        for (const match of locMatches) {
          const loc = match[1].trim();
          // Check if this is a sub-sitemap
          if (loc.includes('sitemap') && loc.endsWith('.xml')) {
            try {
              const subResponse = await fetch(loc, {
                headers: { 'User-Agent': USER_AGENT },
                signal: AbortSignal.timeout(10000),
              });
              if (subResponse.ok) {
                const subText = await subResponse.text();
                const subMatches = subText.matchAll(/<loc>\s*(.*?)\s*<\/loc>/gi);
                for (const subMatch of subMatches) {
                  urls.push(subMatch[1].trim());
                }
              }
            } catch {
              // Skip failed sub-sitemaps
            }
          } else {
            urls.push(loc);
          }
        }
      }

      if (urls.length > 0) break; // Found a valid sitemap
    } catch {
      continue;
    }
  }

  return urls;
}

export async function crawlWebsite(
  startUrl: string,
  callbacks: CrawlCallbacks,
  options: CrawlOptions = {}
): Promise<{ totalPages: number; totalChunks: number; errors: number; skipped: number }> {
  const normalizedStart = normalizeUrl(startUrl);
  const visited = new Set<string>();
  const queue: string[] = [normalizedStart];
  let totalChunks = 0;
  let errors = 0;
  let skipped = 0;

  const DELAY_MS = 500;

  // Fetch and parse robots.txt
  const robots = await fetchRobotsTxt(normalizedStart);

  // Discover sitemap URLs and seed the queue
  const sitemapUrls = await discoverSitemapUrls(normalizedStart);
  for (const sitemapUrl of sitemapUrls) {
    const normalized = normalizeUrl(sitemapUrl);
    if (isSameDomain(normalized, normalizedStart) && !shouldSkipUrl(normalized)) {
      queue.push(normalized);
    }
  }

  while (queue.length > 0) {
    const url = queue.shift()!;

    if (visited.has(url)) continue;
    if (shouldSkipUrl(url)) continue;

    // Respect robots.txt rules
    const robotsAllowed = !robots || robots.isAllowed(url, USER_AGENT) !== false;
    if (!robotsAllowed) {
      skipped++;
      callbacks.onPageSkipped?.(url, 'robots.txt');
      continue;
    }

    visited.add(url);
    callbacks.onProgress(visited.size, visited.size + queue.length, url);

    try {
      // Check for existing page data for incremental crawling
      const existing = options.existingPages?.get(url);
      const conditionalOpts = existing
        ? { ifNoneMatch: existing.etag, ifModifiedSince: existing.lastModified }
        : undefined;

      // Hybrid approach: try HTTP first, fall back to browser
      const extracted = await crawlPageHttp(url, conditionalOpts);

      // 304 Not Modified — skip processing
      if (extracted && extracted.statusCode === 304) {
        skipped++;
        callbacks.onPageSkipped?.(url, 'not_modified');
        continue;
      }

      let content = extracted;
      if (!content) {
        const browserResult = await crawlPageBrowser(url);
        if (browserResult) {
          content = {
            ...browserResult,
            etag: null,
            lastModified: null,
            statusCode: 200,
            rawHtmlLength: browserResult.text.length,
            pageType: 'html' as const,
          };
        }
      }

      if (!content || content.text.length < 50) {
        continue;
      }

      // Content hashing for deduplication
      const contentHash = computeContentHash(content.text);
      if (existing?.contentHash && existing.contentHash === contentHash) {
        skipped++;
        callbacks.onPageSkipped?.(url, 'content_unchanged');
        continue;
      }

      // Chunk the content
      const chunks = chunkText(content.text, url, content.title);
      totalChunks += chunks.length;

      const result: CrawlResult = {
        url,
        canonicalUrl: content.canonical || null,
        title: content.title,
        content: content.text,
        language: content.language || 'en',
        chunks,
        etag: content.etag,
        lastModified: content.lastModified,
        statusCode: content.statusCode,
        rawHtmlLength: content.rawHtmlLength,
        contentHash,
        pageType: content.pageType,
        robotsAllowed,
      };

      await callbacks.onPageCrawled(result);

      // Discover new URLs from links
      for (const link of content.links) {
        const normalizedLink = normalizeUrl(link);
        if (
          !visited.has(normalizedLink) &&
          isSameDomain(normalizedLink, normalizedStart) &&
          !shouldSkipUrl(normalizedLink)
        ) {
          if (robots && !robots.isAllowed(normalizedLink, USER_AGENT)) {
            continue;
          }
          queue.push(normalizedLink);
        }
      }
    } catch (error) {
      errors++;
      callbacks.onError(
        url,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }

    // Rate limiting
    const crawlDelay = robots?.getCrawlDelay(USER_AGENT);
    const delayMs = crawlDelay ? crawlDelay * 1000 : DELAY_MS;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  return {
    totalPages: visited.size,
    totalChunks,
    errors,
    skipped,
  };
}
