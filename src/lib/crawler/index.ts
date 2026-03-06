import { createHash } from 'crypto';
import pLimit from 'p-limit';
import robotsParser from 'robots-parser';
import { crawlPageHttp } from './http-crawler';
import { crawlPageBrowser } from './browser-crawler';
import { closeBrowserPool } from './browser-pool';
import { chunkText, type TextChunk } from './chunker';
import { extractPdfText, isPdfWithinLimit } from './pdf-extractor';
import { isLikelyBoilerplate } from './boilerplate-dedup';
import { normalizeUrl, shouldSkipUrl, isInDomainScope, isPdfUrl } from '@/lib/utils/url';
import type { StructuredData } from './structured-data';
import type { ExtractedContent } from './content-extractor';

interface CrawlPageContent extends ExtractedContent {
  etag: string | null;
  lastModified: string | null;
  statusCode: number;
  rawHtmlLength: number;
  pageType: 'html' | 'pdf' | 'other';
}

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
  structuredData?: StructuredData;
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
  /** Maximum depth of links to follow (1 = homepage only, 10 = everything) */
  max_depth?: number;
  /** Maximum number of pages to crawl */
  max_pages?: number;
  /** Only crawl URLs matching these path patterns (glob supported) */
  include_paths?: string[];
  /** Skip URLs matching these path patterns (glob supported) */
  exclude_paths?: string[];
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
  const fetchedSitemaps = new Set<string>();

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
    if (fetchedSitemaps.has(sitemapUrl)) continue;
    fetchedSitemaps.add(sitemapUrl);

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
            if (fetchedSitemaps.has(loc)) continue;
            fetchedSitemaps.add(loc);
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

      // Collect URLs from ALL sitemaps, not just the first successful one
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

/**
 * Detect if a page is a Single Page Application (SPA).
 * Checks for common SPA root elements with minimal text content.
 */
async function detectSpa(startUrl: string): Promise<boolean> {
  try {
    const response = await fetch(startUrl, {
      headers: { 'User-Agent': `Mozilla/5.0 (compatible; ${USER_AGENT}/1.0)` },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return false;
    const html = await response.text();

    // Check for common SPA root elements
    const spaIndicators = [
      '<div id="root"',
      '<div id="app"',
      '<div id="__next"',
      '<div id="__nuxt"',
      '<div id="__gatsby"',
      'id="svelte"',
    ];

    const hasSpaRoot = spaIndicators.some(indicator => html.includes(indicator));
    if (!hasSpaRoot) return false;

    // Check if there's minimal text content (SPA body is mostly empty before JS runs)
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (!bodyMatch) return false;

    // Strip script and style tags
    const bodyContent = bodyMatch[1]
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // If body text is very short after removing scripts/styles, it's likely an SPA
    return bodyContent.length < 200;
  } catch {
    return false;
  }
}

/**
 * Test whether a URL's pathname matches any of the given glob-style patterns.
 * If patterns is empty, every URL matches (no restriction).
 */
function matchesPathPatterns(url: string, patterns: string[]): boolean {
  if (!patterns || patterns.length === 0) return true;
  try {
    const urlPath = new URL(url).pathname;
    return patterns.some(pattern => {
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

export async function crawlWebsite(
  startUrl: string,
  callbacks: CrawlCallbacks,
  options: CrawlOptions = {}
): Promise<{ totalPages: number; totalChunks: number; errors: number; skipped: number; skippedPages: SkippedPage[] }> {
  const normalizedStart = normalizeUrl(startUrl);
  const visited = new Set<string>();
  const queued = new Set<string>([normalizedStart]);
  const queue: Array<{ url: string; depth: number }> = [{ url: normalizedStart, depth: 0 }];
  let totalChunks = 0;
  let errors = 0;
  let skipped = 0;
  const skippedPages: SkippedPage[] = [];

  const DELAY_MS = 500;
  const maxDepth = options.max_depth ?? 5;
  const MAX_PAGES = options.max_pages || 5000;
  const allowedDomains = options.allowedDomains || [];
  const includePaths = options.include_paths || [];
  const excludePaths = options.exclude_paths || [];

  // Concurrency limiters
  const httpLimit = pLimit(5);
  const browserLimit = pLimit(2);

  // Fetch and parse robots.txt
  const robotsResult = await fetchRobotsTxt(normalizedStart);
  const robots = robotsResult?.parser || null;
  const robotsRawText = robotsResult?.rawText || null;

  // Detect if the site is a SPA
  const isSpa = await detectSpa(normalizedStart);
  if (isSpa) {
    console.log(`Detected SPA at ${normalizedStart}, using browser crawling for all pages`);
  }

  // Discover sitemap URLs (including robots.txt Sitemap: directives)
  const sitemapUrls = await discoverSitemapUrls(normalizedStart, robotsRawText);
  for (const sitemapUrl of sitemapUrls) {
    const normalized = normalizeUrl(sitemapUrl);
    const inInclude = !includePaths.length || matchesPathPatterns(normalized, includePaths);
    const notExcluded = !excludePaths.length || !matchesPathPatterns(normalized, excludePaths);
    if (
      !queued.has(normalized) &&
      inInclude &&
      notExcluded &&
      isInDomainScope(normalized, normalizedStart, allowedDomains) &&
      !shouldSkipUrl(normalized, { allowPdf: true })
    ) {
      // Sitemap URLs are treated as depth 0 (they may be anywhere in the site)
      queue.push({ url: normalized, depth: 0 });
      queued.add(normalized);
    }
  }

  // Get the robots.txt crawl delay
  const crawlDelay = robots?.getCrawlDelay(USER_AGENT);
  const delayMs = crawlDelay ? crawlDelay * 1000 : DELAY_MS;

  // Track crawled count for progress
  let crawledCount = 0;

  async function processUrl(url: string, currentDepth: number): Promise<void> {
    const isPdf = isPdfUrl(url);

    try {
      if (isPdf) {
        // Handle PDF files (#4)
        const pdfResult = await crawlPdfPage(url);
        if (pdfResult) {
          // Filter boilerplate from PDF chunks (#12)
          pdfResult.chunks = pdfResult.chunks.filter((c) => !isLikelyBoilerplate(c.content));
          totalChunks += pdfResult.chunks.length;
          await callbacks.onPageCrawled(pdfResult);
        }
      } else {
        // Hybrid approach: try HTTP first (unless SPA), fall back to browser
        const existing = options.existingPages?.get(url);
        let content: CrawlPageContent | null = null;

        if (!isSpa) {
          const conditionalOpts = existing
            ? { ifNoneMatch: existing.etag, ifModifiedSince: existing.lastModified }
            : undefined;

          const extracted = await crawlPageHttp(url, conditionalOpts);

          // 304 Not Modified — skip processing
          if (extracted && extracted.statusCode === 304) {
            skipped++;
            skippedPages.push({ url, reason: 'not_modified', timestamp: new Date().toISOString() });
            callbacks.onPageSkipped?.(url, 'not_modified');
            return;
          }

          content = extracted;
        }

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
          return;
        }

        // Content hashing for deduplication
        const contentHash = computeContentHash(content.text);
        if (existing?.contentHash && existing.contentHash === contentHash) {
          skipped++;
          skippedPages.push({ url, reason: 'content_unchanged', timestamp: new Date().toISOString() });
          callbacks.onPageSkipped?.(url, 'content_unchanged');
          return;
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
          robotsAllowed: true,
          structuredData: content.structuredData,
        };

        await callbacks.onPageCrawled(result);

        // Discover new URLs from links (#6 -- domain-aware)
        if (currentDepth < maxDepth) {
          for (const link of content.links) {
            if (queued.size >= MAX_PAGES) break;
            const normalizedLink = normalizeUrl(link);
            const inInclude = !includePaths.length || matchesPathPatterns(normalizedLink, includePaths);
            const notExcluded = !excludePaths.length || !matchesPathPatterns(normalizedLink, excludePaths);
            if (
              inInclude &&
              notExcluded &&
              !queued.has(normalizedLink) &&
              isInDomainScope(normalizedLink, normalizedStart, allowedDomains) &&
              !shouldSkipUrl(normalizedLink, { allowPdf: true })
            ) {
              if (robots && !robots.isAllowed(normalizedLink, USER_AGENT)) {
                continue;
              }
              queue.push({ url: normalizedLink, depth: currentDepth + 1 });
              queued.add(normalizedLink);
            }
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

    crawledCount++;
    callbacks.onProgress(crawledCount, queued.size, url);
  }

  // Main loop processes batches of URLs concurrently
  while (queue.length > 0) {
    const batch = queue.splice(0, Math.min(queue.length, 10));
    const tasks: Promise<void>[] = [];

    for (const { url, depth } of batch) {
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

      if (isPdf || isSpa) {
        tasks.push(browserLimit(() => processUrl(url, depth)));
      } else {
        tasks.push(httpLimit(() => processUrl(url, depth)));
      }
    }

    await Promise.allSettled(tasks);

    // Rate limiting between batches
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  // Clean up browser pool
  await closeBrowserPool();

  return {
    totalPages: visited.size,
    totalChunks,
    errors,
    skipped,
    skippedPages,
  };
}

