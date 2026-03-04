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

  while (queue.length > 0) {
    const url = queue.shift()!;

    if (visited.has(url)) continue;
    if (shouldSkipUrl(url)) continue;

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
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
  }

  return {
    totalPages: visited.size,
    totalChunks,
    errors,
  };
}
