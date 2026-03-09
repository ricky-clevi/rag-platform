import { extractContent, type ExtractedContent } from './content-extractor';

const DEFAULT_TIMEOUT = 15000;
const USER_AGENT =
  'Mozilla/5.0 (compatible; AgentForgeBot/1.0; +https://agentforge.dev)';

export interface FetchResult {
  html: string;
  status: number;
  etag: string | null;
  lastModified: string | null;
  contentType: string;
}

export async function fetchPage(
  url: string,
  options?: { ifNoneMatch?: string; ifModifiedSince?: string }
): Promise<FetchResult | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

    const headers: Record<string, string> = {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/pdf',
      'Accept-Language': 'en-US,en;q=0.9,ko;q=0.8',
    };

    // Conditional request headers for efficient recrawling
    if (options?.ifNoneMatch) {
      headers['If-None-Match'] = options.ifNoneMatch;
    }
    if (options?.ifModifiedSince) {
      headers['If-Modified-Since'] = options.ifModifiedSince;
    }

    const response = await fetch(url, {
      headers,
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeout);

    // 304 Not Modified — content hasn't changed
    if (response.status === 304) {
      return {
        html: '',
        status: 304,
        etag: response.headers.get('etag'),
        lastModified: response.headers.get('last-modified'),
        contentType: response.headers.get('content-type') || '',
      };
    }

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get('content-type') || '';

    const html = await response.text();
    return {
      html,
      status: response.status,
      etag: response.headers.get('etag'),
      lastModified: response.headers.get('last-modified'),
      contentType,
    };
  } catch {
    return null;
  }
}

export async function crawlPageHttp(
  url: string,
  options?: { ifNoneMatch?: string; ifModifiedSince?: string }
): Promise<(ExtractedContent & { etag: string | null; lastModified: string | null; statusCode: number; rawHtmlLength: number; pageType: 'html' | 'pdf' | 'other' }) | null> {
  const result = await fetchPage(url, options);
  if (!result) return null;

  // 304 Not Modified
  if (result.status === 304) {
    return {
      title: '',
      text: '',
      links: [],
      description: '',
      canonical: null,
      language: 'en',
      etag: result.etag,
      lastModified: result.lastModified,
      statusCode: 304,
      rawHtmlLength: 0,
      pageType: 'html',
    };
  }

  const isHtml = result.contentType.includes('text/html') || result.contentType.includes('application/xhtml');
  const isPdf = result.contentType.includes('application/pdf');

  if (!isHtml && !isPdf) {
    return null;
  }

  if (isPdf) {
    // Return minimal info for PDF — actual extraction handled separately
    return {
      title: url.split('/').pop() || 'PDF Document',
      text: '',
      links: [],
      description: '',
      canonical: null,
      language: 'en',
      etag: result.etag,
      lastModified: result.lastModified,
      statusCode: result.status,
      rawHtmlLength: result.html.length,
      pageType: 'pdf',
    };
  }

  const extracted = extractContent(result.html, url);

  // If content is too minimal, still return the result with links intact
  // so the crawler can discover follow-up pages even from thin hub pages.
  // Mark it as thin so the caller can decide whether to try browser crawling.
  return {
    ...extracted,
    etag: result.etag,
    lastModified: result.lastModified,
    statusCode: result.status,
    rawHtmlLength: result.html.length,
    pageType: 'html' as const,
  };
}
