import { createHash } from 'crypto';
import robotsParser from 'robots-parser';
import { crawlPageHttp } from './http-crawler';
import { crawlPageBrowser } from './browser-crawler';
import { chunkText, type TextChunk } from './chunker';
import { extractPdfText, isPdfWithinLimit } from './pdf-extractor';
import { isLikelyBoilerplate } from './boilerplate-dedup';
import { normalizeUrl, shouldSkipUrl, isInDomainScope, isPdfUrl } from '@/lib/utils/url';

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

export interface SkippedPage {
  url: string;
  reason: string;
  timestamp: string;
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
  /** Approved additional domains/subdomains for crawling scope */
  allowedDomains?: string[];
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
      return { parser: robotsParser(robotsUrl, text), rawText: text };
    }
  } catch {
    // If robots.txt is not available, allow all
  }
  return null;
}

/**
 * Parse Sitemap: directives from robots.txt content (#8).
 */
function parseSitemapDirectives(robotsTxt: string): string[] {
  const sitemaps: string[] = [];
  const lines = robotsTxt.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.toLowerCase().startsWith('sitemap:')) {
      const url = trimmed.slice('sitemap:'.length).trim();
      if (url.startsWith('http')) {
        sitemaps.push(url);
      }
    }
  }
  return sitemaps;
}

async function discoverSitemapUrls(baseUrl: string, robotsTxt?: string | null): Promise<string[]> {
  const urls: string[] = [];

  // Start with sitemaps declared in robots.txt (#8)
  const declaredSitemaps = robotsTxt ? parseSitemapDirectives(robotsTxt) : [];

  // Also try common paths
  const commonPaths = ['/sitemap.xml', '/sitemap_index.xml', '/sitemap.txt'];
  const sitemapSources = [
    ...declaredSitemaps,
    ...commonPaths.map((p) => new URL(p, baseUrl).toString()),
  ];

  // Deduplicate
  const uniqueSources = [...new Set(sitemapSources)];

  for (const sitemapUrl of uniqueSources) {
    try {
      const response = await fetch(sitemapUrl, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) continue;
      const text = await response.text();

      if (sitemapUrl.endsWith('.txt') && !text.trimStart().startsWith('<?xml') && !text.trimStart().startsWith('<')) {
        const lines = text.split('\n').filter((l) => l.trim().startsWith('http'));
        urls.push(...lines.map((l) => l.trim()));
      } else {
        const locMatches = text.matchAll(/<loc>\s*(.*?)\s*<\/loc>/gi);
        for (const match of locMatches) {
          const loc = match[1].trim();
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

      if (urls.length > 0) break;
    } catch {
      continue;
    }
  }

  return urls;
}

/**
 * Fetch and extract text from a PDF URL (#4).
 */
async function crawlPdfPage(url: string): Promise<CrawlResult | null> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': `Mozilla/5.0 (compatible; ${USER_AGENT}/1.0)` },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    if (!isPdfWithinLimit(buffer)) {
      return null;
    }

    const { title, text, language } = await extractPdfText(buffer, url);
    if (!text || text.length < 50) return null;

    const contentHash = computeContentHash(text);
    const chunks = chunkText(text, url, title);

    return {
      url,
      canonicalUrl: null,
      title,
      content: text,
      language,
      chunks,
      etag: response.headers.get('etag'),
      lastModified: response.headers.get('last-modified'),
      statusCode: response.status,
      rawHtmlLength: buffer.length,
      contentHash,
      pageType: 'pdf',
      robotsAllowed: true,
    };
  } catch (error) {
    console.error(`PDF crawl failed for ${url}:`, error);
    return null;
  }
}

export async function crawlWebsite(
  startUrl: string,
  callbacks: CrawlCallbacks,
  options: CrawlOptions = {}
): Promise<{ totalPages: number; totalChunks: number; errors: number; skipped: number; skippedPages: SkippedPage[] }> {
  const normalizedStart = normalizeUrl(startUrl);
  const visited = new Set<string>();
  const queue: string[] = [normalizedStart];
  let totalChunks = 0;
  let errors = 0;
  let skipped = 0;
  const skippedPages: SkippedPage[] = [];

  const DELAY_MS = 500;
  const allowedDomains = options.allowedDomains || [];

  // Fetch and parse robots.txt
  const robotsResult = await fetchRobotsTxt(normalizedStart);
  const robots = robotsResult?.parser || null;
  const robotsRawText = robotsResult?.rawText || null;

  // Discover sitemap URLs (including robots.txt Sitemap: directives)
  const sitemapUrls = await discoverSitemapUrls(normalizedStart, robotsRawText);
  for (const sitemapUrl of sitemapUrls) {
    const normalized = normalizeUrl(sitemapUrl);
    if (
      isInDomainScope(normalized, normalizedStart, allowedDomains) &&
      !shouldSkipUrl(normalized, { allowPdf: true })
    ) {
      queue.push(normalized);
    }
  }

  while (queue.length > 0) {
    const url = queue.shift()!;

    if (visited.has(url)) continue;

    const isPdf = isPdfUrl(url);
    if (!isPdf && shouldSkipUrl(url, { allowPdf: false })) {
      skipped++;
      skippedPages.push({ url, reason: 'excluded_pattern', timestamp: new Date().toISOString() });
      callbacks.onPageSkipped?.(url, 'excluded_pattern');
      continue;
    }

    // Respect robots.txt rules
    const robotsAllowed = !robots || robots.isAllowed(url, USER_AGENT) !== false;
    if (!robotsAllowed) {
      skipped++;
      skippedPages.push({ url, reason: 'robots.txt', timestamp: new Date().toISOString() });
      callbacks.onPageSkipped?.(url, 'robots.txt');
      continue;
    }

    visited.add(url);
    callbacks.onProgress(visited.size, visited.size + queue.length, url);

    try {
      if (isPdf) {
        // Handle PDF files (#4)
        const existing = options.existingPages?.get(url);
        if (existing?.contentHash) {
          // For incremental, skip unchanged PDFs by checking last-modified
        }

        const pdfResult = await crawlPdfPage(url);
        if (pdfResult) {
          // Filter boilerplate from PDF chunks (#12)
          pdfResult.chunks = pdfResult.chunks.filter((c) => !isLikelyBoilerplate(c.content));
          totalChunks += pdfResult.chunks.length;
          await callbacks.onPageCrawled(pdfResult);
        }
      } else {
        // Hybrid approach: try HTTP first, fall back to browser
        const existing = options.existingPages?.get(url);
        const conditionalOpts = existing
          ? { ifNoneMatch: existing.etag, ifModifiedSince: existing.lastModified }
          : undefined;

        const extracted = await crawlPageHttp(url, conditionalOpts);

        // 304 Not Modified — skip processing
        if (extracted && extracted.statusCode === 304) {
          skipped++;
          skippedPages.push({ url, reason: 'not_modified', timestamp: new Date().toISOString() });
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
          skippedPages.push({ url, reason: 'content_unchanged', timestamp: new Date().toISOString() });
          callbacks.onPageSkipped?.(url, 'content_unchanged');
          continue;
        }

        // Chunk the content, filtering boilerplate (#12)
        const rawChunks = chunkText(content.text, url, content.title);
        const chunks = rawChunks.filter((c) => !isLikelyBoilerplate(c.content));
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

        // Discover new URLs from links (#6 — domain-aware)
        for (const link of content.links) {
          const normalizedLink = normalizeUrl(link);
          if (
            !visited.has(normalizedLink) &&
            isInDomainScope(normalizedLink, normalizedStart, allowedDomains) &&
            !shouldSkipUrl(normalizedLink, { allowPdf: true })
          ) {
            if (robots && !robots.isAllowed(normalizedLink, USER_AGENT)) {
              continue;
            }
            queue.push(normalizedLink);
          }
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
    skippedPages,
  };
}
