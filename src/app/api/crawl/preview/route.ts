import { NextRequest, NextResponse } from 'next/server';
import { isValidUrl, normalizeUrl, extractDomain } from '@/lib/utils/url';

export async function POST(request: NextRequest) {
  const { url } = await request.json();

  if (!url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }

  const targetUrl = url.startsWith('http') ? url : `https://${url}`;

  if (!isValidUrl(targetUrl)) {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  const normalizedUrl = normalizeUrl(targetUrl);
  const domain = extractDomain(normalizedUrl);

  try {
    const results = await Promise.allSettled([
      // Fetch homepage
      fetch(normalizedUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AgentForgeBot/1.0)' },
        signal: AbortSignal.timeout(8000),
        redirect: 'follow',
      }).then(async (r) => {
        if (!r.ok) return null;
        const html = await r.text();
        return { html, status: r.status };
      }),

      // Fetch robots.txt
      fetch(new URL('/robots.txt', normalizedUrl).toString(), {
        headers: { 'User-Agent': 'AgentForgeBot' },
        signal: AbortSignal.timeout(5000),
      }).then(async (r) => {
        if (!r.ok) return null;
        return r.text();
      }),

      // Fetch sitemap.xml
      fetch(new URL('/sitemap.xml', normalizedUrl).toString(), {
        headers: { 'User-Agent': 'AgentForgeBot' },
        signal: AbortSignal.timeout(5000),
      }).then(async (r) => {
        if (!r.ok) return null;
        return r.text();
      }),
    ]);

    const homepage = results[0].status === 'fulfilled' ? results[0].value : null;
    const robotsTxt = results[1].status === 'fulfilled' ? results[1].value : null;
    const sitemapXml = results[2].status === 'fulfilled' ? results[2].value : null;

    // Parse homepage for metadata
    let companyName = domain;
    let description = '';
    let language = 'en';
    let isSpa = false;

    if (homepage?.html) {
      // Extract title
      const titleMatch = homepage.html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const ogTitle = homepage.html.match(/property="og:title"\s+content="([^"]+)"/i) ||
                      homepage.html.match(/content="([^"]+)"\s+property="og:title"/i);
      const ogSiteName = homepage.html.match(/property="og:site_name"\s+content="([^"]+)"/i) ||
                         homepage.html.match(/content="([^"]+)"\s+property="og:site_name"/i);

      companyName = ogSiteName?.[1] || ogTitle?.[1] || titleMatch?.[1]?.split(/[|\-\u2013\u2014]/)[0]?.trim() || domain;

      // Extract description
      const descMatch = homepage.html.match(/name="description"\s+content="([^"]+)"/i) ||
                        homepage.html.match(/content="([^"]+)"\s+name="description"/i);
      const ogDesc = homepage.html.match(/property="og:description"\s+content="([^"]+)"/i) ||
                     homepage.html.match(/content="([^"]+)"\s+property="og:description"/i);
      description = descMatch?.[1] || ogDesc?.[1] || '';

      // Detect language
      const langMatch = homepage.html.match(/<html[^>]+lang="([^"]+)"/i);
      language = langMatch?.[1]?.split('-')[0] || 'en';

      // Detect SPA
      isSpa = !!(
        homepage.html.includes('id="root"') ||
        homepage.html.includes('id="app"') ||
        homepage.html.includes('id="__next"') ||
        homepage.html.includes('id="__nuxt"')
      );
    }

    // Count sitemap URLs
    let estimatedPages = 0;
    let hasSitemap = false;

    if (sitemapXml) {
      hasSitemap = true;
      const locMatches = sitemapXml.match(/<loc>/gi);
      estimatedPages = locMatches?.length || 0;

      // Check for sitemap index (contains sub-sitemaps)
      if (sitemapXml.includes('<sitemapindex')) {
        estimatedPages = estimatedPages * 50; // Rough estimate
      }
    }

    if (estimatedPages === 0) {
      // Rough estimate based on typical site size
      estimatedPages = 50;
    }

    // Check robots.txt for crawl restrictions
    let crawlAllowed = true;
    let crawlDelay = 0;

    if (robotsTxt) {
      const lines = robotsTxt.split('\n');
      let inAgentBlock = false;
      for (const line of lines) {
        const trimmed = line.trim().toLowerCase();
        if (trimmed.startsWith('user-agent:')) {
          const agent = trimmed.split(':')[1]?.trim();
          inAgentBlock = agent === '*' || agent === 'agentforgebot';
        }
        if (inAgentBlock && trimmed === 'disallow: /') {
          crawlAllowed = false;
        }
        if (inAgentBlock && trimmed.startsWith('crawl-delay:')) {
          crawlDelay = parseInt(trimmed.split(':')[1]?.trim() || '0', 10);
        }
      }
    }

    // Estimate crawl time (rough)
    const delayPerPage = Math.max(crawlDelay * 1000, 500);
    const pagesPerSecond = isSpa ? 0.5 : (1000 / delayPerPage) * 5; // Factor in concurrency
    const estimatedMinutes = Math.ceil(estimatedPages / pagesPerSecond / 60);

    return NextResponse.json({
      url: normalizedUrl,
      domain,
      companyName,
      description,
      language,
      isSpa,
      estimatedPages,
      hasSitemap,
      crawlAllowed,
      crawlDelay,
      estimatedMinutes: Math.max(1, estimatedMinutes),
      reachable: !!homepage,
    });
  } catch {
    return NextResponse.json({
      url: normalizedUrl,
      domain,
      companyName: domain,
      description: '',
      language: 'en',
      isSpa: false,
      estimatedPages: 0,
      hasSitemap: false,
      crawlAllowed: true,
      crawlDelay: 0,
      estimatedMinutes: 0,
      reachable: false,
      error: 'Could not reach the website',
    });
  }
}
