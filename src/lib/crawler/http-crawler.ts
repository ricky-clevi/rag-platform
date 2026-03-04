import { extractContent, type ExtractedContent } from './content-extractor';

const DEFAULT_TIMEOUT = 15000;
const USER_AGENT =
  'Mozilla/5.0 (compatible; AgentForgeBot/1.0; +https://agentforge.dev)';

export async function fetchPage(
  url: string
): Promise<{ html: string; status: number } | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9,ko;q=0.8',
      },
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      return null;
    }

    const html = await response.text();
    return { html, status: response.status };
  } catch {
    return null;
  }
}

export async function crawlPageHttp(
  url: string
): Promise<ExtractedContent | null> {
  const result = await fetchPage(url);
  if (!result) return null;

  const extracted = extractContent(result.html, url);

  // If content is too minimal, return null so browser crawler can try
  if (extracted.text.length < 100) {
    return null;
  }

  return extracted;
}
