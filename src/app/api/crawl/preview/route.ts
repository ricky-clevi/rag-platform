import { NextRequest, NextResponse } from 'next/server';
import { isValidUrl } from '@/lib/utils/url';
import { mapSiteUrls } from '@/lib/data/workspace';

export async function POST(request: NextRequest) {
  const {
    url,
    include_paths = [],
    exclude_paths = [],
  } = await request.json();

  if (!url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }

  const targetUrl = url.startsWith('http') ? url : `https://${url}`;

  if (!isValidUrl(targetUrl)) {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  try {
    const mapResult = await mapSiteUrls(targetUrl, {
      includePaths: include_paths,
      excludePaths: exclude_paths,
    });
    const homepageResult = await fetch(mapResult.rootUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AgentForgeBot/1.0)' },
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
    });
    const homepageHtml = homepageResult.ok ? await homepageResult.text() : '';

    const likelySpa = ['id="root"', 'id="app"', 'id="__next"', 'id="__nuxt"'].some((token) =>
      homepageHtml.includes(token)
    );

    return NextResponse.json({
      url: mapResult.rootUrl,
      hostname: mapResult.domain,
      totalUrls: mapResult.discoveredCount,
      urls: mapResult.urls,
      hasSitemap: mapResult.hasSitemap,
      crawlAllowed: mapResult.crawlAllowed,
      likelySpa,
      reachable: homepageResult.ok,
      estimatedPages: mapResult.discoveredCount,
      estimatedMinutes: Math.max(1, Math.ceil(mapResult.discoveredCount / (likelySpa ? 30 : 120))),
      pathGroups: mapResult.pathGroups,
    });
  } catch {
    const fallbackUrl = targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`;

    return NextResponse.json({
      url: fallbackUrl,
      hostname: '',
      totalUrls: 0,
      urls: [],
      hasSitemap: false,
      crawlAllowed: true,
      likelySpa: false,
      reachable: false,
      estimatedPages: 0,
      estimatedMinutes: 0,
      pathGroups: [],
      error: 'Could not reach the website',
    });
  }
}
