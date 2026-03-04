import robotsParser from 'robots-parser';
import { crawlPageHttp } from './http-crawler';
import { crawlPageBrowser } from './browser-crawler';
import { chunkText, type TextChunk } from './chunker';
import { normalizeUrl, isSameDomain, shouldSkipUrl } from '@/lib/utils/url';
import type { ExtractedContent } from './content-extractor';

export interface CrawlResult {
  url: string;
  title: string;
  content: string;
  description: string;
  chunks: TextChunk[];
}

export interface CrawlCallbacks {
  onPageCrawled: (result: CrawlResult) => Promise<void>;
  onProgress: (crawled: number, discovered: number, currentUrl: string) => void;
  onError: (url: string, error: string) => void;
}

const USER_AGENT = 'AgentForgeBot';

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

export async function crawlWebsite(
  startUrl: string,
  callbacks: CrawlCallbacks
): Promise<{ totalPages: number; totalChunks: number; errors: number }> {
  const normalizedStart = normalizeUrl(startUrl);
  const visited = new Set<string>();
  const queue: string[] = [normalizedStart];
  let totalChunks = 0;
  let errors = 0;

  // Rate limiting: delay between requests
  const DELAY_MS = 500;

  // Fetch and parse robots.txt before crawling
  const robots = await fetchRobotsTxt(normalizedStart);

  while (queue.length > 0) {
    const url = queue.shift()!;

    if (visited.has(url)) continue;
    if (shouldSkipUrl(url)) continue;

    // Respect robots.txt rules
    if (robots && !robots.isAllowed(url, USER_AGENT)) {
      continue;
    }

    visited.add(url);

    callbacks.onProgress(visited.size, visited.size + queue.length, url);

    try {
      // Hybrid approach: try HTTP first, fall back to browser
      let extracted: ExtractedContent | null = await crawlPageHttp(url);

      if (!extracted) {
        extracted = await crawlPageBrowser(url);
      }

      if (!extracted || extracted.text.length < 50) {
        continue;
      }

      // Chunk the content
      const chunks = chunkText(
        extracted.text,
        url,
        extracted.title
      );

      totalChunks += chunks.length;

      const result: CrawlResult = {
        url,
        title: extracted.title,
        content: extracted.text,
        description: extracted.description,
        chunks,
      };

      await callbacks.onPageCrawled(result);

      // Discover new URLs
      for (const link of extracted.links) {
        const normalizedLink = normalizeUrl(link);
        if (
          !visited.has(normalizedLink) &&
          isSameDomain(normalizedLink, normalizedStart) &&
          !shouldSkipUrl(normalizedLink)
        ) {
          // Respect robots.txt for discovered URLs too
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

    // Rate limiting — also respect crawl-delay from robots.txt
    const crawlDelay = robots?.getCrawlDelay(USER_AGENT);
    const delayMs = crawlDelay ? crawlDelay * 1000 : DELAY_MS;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  return {
    totalPages: visited.size,
    totalChunks,
    errors,
  };
}
