import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractDomain, isValidUrl, normalizeUrl } from '@/lib/utils/url';

function parseSitemapUrls(xml: string): string[] {
  return Array.from(xml.matchAll(/<loc>\s*(.*?)\s*<\/loc>/gi)).map((match) => match[1].trim());
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { url } = await request.json();
  const targetUrl = typeof url === 'string' && url.startsWith('http') ? url : `https://${url || ''}`;

  if (!isValidUrl(targetUrl)) {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  const normalizedUrl = normalizeUrl(targetUrl);
  const sitemapUrl = new URL('/sitemap.xml', normalizedUrl).toString();
  const robotsUrl = new URL('/robots.txt', normalizedUrl).toString();

  const [homepage, sitemap, robots] = await Promise.allSettled([
    fetch(normalizedUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AgentForgeBot/1.0)' },
      signal: AbortSignal.timeout(8000),
    }).then((response) => response.ok ? response.text() : ''),
    fetch(sitemapUrl, {
      headers: { 'User-Agent': 'AgentForgeBot' },
      signal: AbortSignal.timeout(8000),
    }).then((response) => response.ok ? response.text() : ''),
    fetch(robotsUrl, {
      headers: { 'User-Agent': 'AgentForgeBot' },
      signal: AbortSignal.timeout(5000),
    }).then((response) => response.ok ? response.text() : ''),
  ]);

  const homepageHtml = homepage.status === 'fulfilled' ? homepage.value : '';
  const sitemapXml = sitemap.status === 'fulfilled' ? sitemap.value : '';
  const robotsTxt = robots.status === 'fulfilled' ? robots.value : '';
  const urls = parseSitemapUrls(sitemapXml).filter((value) => value.startsWith('http'));
  const crawlAllowed = !/disallow:\s*\/$/im.test(robotsTxt);
  const likelySpa = ['id="root"', 'id="app"', 'id="__next"', 'id="__nuxt"'].some((token) => homepageHtml.includes(token));

  return NextResponse.json({
    url: normalizedUrl,
    hostname: extractDomain(normalizedUrl),
    totalUrls: urls.length,
    urls: urls.slice(0, 100),
    hasSitemap: urls.length > 0,
    crawlAllowed,
    likelySpa,
  });
}
