import * as cheerio from 'cheerio';

export interface StructuredData {
  jsonLd: Record<string, unknown>[];
  openGraph: Record<string, string>;
  meta: {
    companyName?: string;
    phone?: string;
    email?: string;
    address?: string;
    description?: string;
  };
}

export function extractStructuredData(html: string, _url: string): StructuredData {
  const $ = cheerio.load(html);

  // Extract JSON-LD
  const jsonLd: Record<string, unknown>[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() || '');
      if (Array.isArray(data)) jsonLd.push(...data);
      else jsonLd.push(data);
    } catch { /* skip invalid JSON-LD */ }
  });

  // Extract OpenGraph
  const openGraph: Record<string, string> = {};
  $('meta[property^="og:"]').each((_, el) => {
    const prop = $(el).attr('property')?.replace('og:', '') || '';
    const content = $(el).attr('content') || '';
    if (prop && content) openGraph[prop] = content;
  });

  // Extract company meta info
  const meta: StructuredData['meta'] = {};

  // Company name from various sources
  meta.companyName =
    (jsonLd.find(d => d['@type'] === 'Organization')?.name as string) ||
    openGraph.site_name ||
    $('meta[name="application-name"]').attr('content') ||
    undefined;

  meta.description =
    $('meta[name="description"]').attr('content') ||
    openGraph.description ||
    undefined;

  // Extract phone/email from JSON-LD
  const org = jsonLd.find(d => d['@type'] === 'Organization' || d['@type'] === 'LocalBusiness');
  if (org) {
    meta.phone = (org.telephone as string) || undefined;
    meta.email = (org.email as string) || undefined;
    const addr = org.address as Record<string, string> | undefined;
    if (addr) {
      meta.address = [addr.streetAddress, addr.addressLocality, addr.addressRegion, addr.postalCode]
        .filter(Boolean).join(', ');
    }
  }

  return { jsonLd, openGraph, meta };
}

export function structuredDataToText(data: StructuredData): string {
  const parts: string[] = [];

  if (data.meta.companyName) parts.push(`Company: ${data.meta.companyName}`);
  if (data.meta.description) parts.push(`Description: ${data.meta.description}`);
  if (data.meta.phone) parts.push(`Phone: ${data.meta.phone}`);
  if (data.meta.email) parts.push(`Email: ${data.meta.email}`);
  if (data.meta.address) parts.push(`Address: ${data.meta.address}`);

  // Extract FAQ data
  for (const item of data.jsonLd) {
    if (item['@type'] === 'FAQPage' && Array.isArray(item.mainEntity)) {
      parts.push('\nFrequently Asked Questions:');
      for (const q of item.mainEntity) {
        if (q['@type'] === 'Question') {
          parts.push(`Q: ${q.name}`);
          const answer = q.acceptedAnswer;
          if (answer && typeof answer === 'object' && 'text' in answer) {
            parts.push(`A: ${(answer as Record<string, unknown>).text}`);
          }
        }
      }
    }

    // Extract product info
    if (item['@type'] === 'Product') {
      parts.push(`\nProduct: ${item.name}`);
      if (item.description) parts.push(`Description: ${item.description}`);
      const offers = item.offers as Record<string, unknown> | undefined;
      if (offers?.price) parts.push(`Price: ${offers.priceCurrency || ''}${offers.price}`);
    }
  }

  return parts.join('\n');
}
