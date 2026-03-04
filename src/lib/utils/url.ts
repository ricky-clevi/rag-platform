export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    // Remove trailing slash, fragment, common tracking params
    parsed.hash = '';
    parsed.searchParams.delete('utm_source');
    parsed.searchParams.delete('utm_medium');
    parsed.searchParams.delete('utm_campaign');
    parsed.searchParams.delete('utm_content');
    parsed.searchParams.delete('utm_term');
    let normalized = parsed.toString();
    if (normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return url;
  }
}

export function isSameDomain(url: string, baseUrl: string): boolean {
  try {
    const parsedUrl = new URL(url);
    const parsedBase = new URL(baseUrl);
    return parsedUrl.hostname === parsedBase.hostname;
  } catch {
    return false;
  }
}

export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

export function extractDomain(url: string): string {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function shouldSkipUrl(url: string): boolean {
  const skipExtensions = [
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.zip', '.tar', '.gz', '.rar',
    '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico',
    '.mp3', '.mp4', '.avi', '.mov', '.wmv',
    '.css', '.js', '.json', '.xml', '.rss',
  ];

  const skipPatterns = [
    '/wp-admin', '/wp-login', '/feed', '/rss',
    'javascript:', 'mailto:', 'tel:', '#',
  ];

  const lowerUrl = url.toLowerCase();
  return (
    skipExtensions.some(ext => lowerUrl.endsWith(ext)) ||
    skipPatterns.some(pattern => lowerUrl.includes(pattern))
  );
}
