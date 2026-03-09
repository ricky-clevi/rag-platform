import * as cheerio from 'cheerio';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { extractStructuredData, type StructuredData } from './structured-data';

const REMOVE_SELECTORS = [
  'script', 'style', 'noscript', 'iframe', 'svg',
  '.cookie-banner', '.cookie-notice', '.cookie-consent',
  '.popup', '.modal', '.overlay',
  '.advertisement', '.ad', '.ads', '.adsbygoogle',
  '.social-share', '.social-links',
  '#comments', '.comments',
];

const NAV_FOOTER_SELECTORS = [
  'nav', 'footer', 'header',
  '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
  '.sidebar', '.widget',
];

export interface ExtractedContent {
  title: string;
  text: string;
  links: string[];
  description: string;
  canonical: string | null;
  language: string;
  structuredData?: StructuredData;
}

/**
 * Extract contact information (phone, email) from the full page HTML
 * before nav/footer areas are removed.
 */
function extractContactInfo($: cheerio.CheerioAPI): string[] {
  const contactParts: string[] = [];

  // Look in nav/footer/header areas for contact info before we remove them
  const navFooterHtml = NAV_FOOTER_SELECTORS.map(sel => {
    const elements: string[] = [];
    $(sel).each((_, el) => {
      elements.push($(el).text());
    });
    return elements.join(' ');
  }).join(' ');

  // Extract phone numbers
  const phoneRegex = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g;
  const phones = navFooterHtml.match(phoneRegex);
  if (phones) {
    const uniquePhones = [...new Set(phones.map(p => p.trim()))];
    for (const phone of uniquePhones) {
      contactParts.push(`Phone: ${phone}`);
    }
  }

  // Extract email addresses
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const allText = $('body').text();
  const emails = allText.match(emailRegex);
  if (emails) {
    const uniqueEmails = [...new Set(emails)];
    for (const email of uniqueEmails) {
      contactParts.push(`Email: ${email}`);
    }
  }

  return contactParts;
}

/**
 * Extract all links from the page (including nav/footer) for URL discovery.
 */
function extractLinks($: cheerio.CheerioAPI, baseUrl: string): string[] {
  const links: string[] = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (href) {
      try {
        const absoluteUrl = new URL(href, baseUrl).toString();
        links.push(absoluteUrl);
      } catch {
        // Skip invalid URLs
      }
    }
  });
  return links;
}

/**
 * Extract image alt text as contextual content.
 */
function extractImageAltText($: cheerio.CheerioAPI): string[] {
  const alts: string[] = [];
  $('img[alt]').each((_, el) => {
    const alt = $(el).attr('alt')?.trim();
    if (alt && alt.length > 5 && alt.length < 200) {
      alts.push(`[Image: ${alt}]`);
    }
  });
  return alts;
}

/**
 * Convert an HTML table to a markdown table.
 */
function tableToMarkdown($: cheerio.CheerioAPI, table: Parameters<ReturnType<typeof cheerio.load>>['0']): string {
  const rows: string[][] = [];

  $(table).find('tr').each((_, tr) => {
    const cells: string[] = [];
    $(tr).find('th, td').each((__, cell) => {
      cells.push($(cell).text().trim().replace(/\|/g, '\\|').replace(/\n/g, ' '));
    });
    if (cells.length > 0) {
      rows.push(cells);
    }
  });

  if (rows.length === 0) return '';

  // Normalize column count
  const maxCols = Math.max(...rows.map(r => r.length));
  const normalizedRows = rows.map(r => {
    while (r.length < maxCols) r.push('');
    return r;
  });

  const lines: string[] = [];
  // Header row
  lines.push('| ' + normalizedRows[0].join(' | ') + ' |');
  lines.push('| ' + normalizedRows[0].map(() => '---').join(' | ') + ' |');

  // Data rows
  for (let i = 1; i < normalizedRows.length; i++) {
    lines.push('| ' + normalizedRows[i].join(' | ') + ' |');
  }

  return lines.join('\n');
}

/**
 * Improved cheerio-based content extraction as fallback.
 */
function cheerioExtract($: cheerio.CheerioAPI, baseUrl: string): string {
  // Remove unwanted elements (but not nav/footer - those were handled for contact info)
  REMOVE_SELECTORS.forEach(selector => {
    $(selector).remove();
  });
  NAV_FOOTER_SELECTORS.forEach(selector => {
    $(selector).remove();
  });

  // Extract main content area
  let mainContent = $('main, article, [role="main"]');
  if (mainContent.length === 0) {
    mainContent = $('body');
  }

  const textParts: string[] = [];

  // Process elements in document order
  mainContent.find('*').each((_, el) => {
    const tagName = ('tagName' in el ? (el as unknown as { tagName: string }).tagName : '').toLowerCase();
    const $el = $(el);

    // Skip if element has no direct text content (children will be processed)
    if (!tagName) return;

    switch (tagName) {
      case 'h1':
        textParts.push(`\n## ${$el.text().trim()}\n`);
        break;
      case 'h2':
        textParts.push(`\n### ${$el.text().trim()}\n`);
        break;
      case 'h3':
        textParts.push(`\n#### ${$el.text().trim()}\n`);
        break;
      case 'h4':
        textParts.push(`\n##### ${$el.text().trim()}\n`);
        break;
      case 'h5':
      case 'h6':
        textParts.push(`\n###### ${$el.text().trim()}\n`);
        break;
      case 'p':
      case 'blockquote':
      case 'figcaption':
      case 'dd':
      case 'dt':
      case 'pre':
      case 'address':
      case 'summary':
      case 'details': {
        // Only add direct text, not nested text from child block elements
        const text = $el.clone().children('h1,h2,h3,h4,h5,h6,p,table,ul,ol,blockquote,div').remove().end().text().trim();
        if (text.length > 0) {
          textParts.push(text);
        }
        break;
      }
      case 'li': {
        const text = $el.clone().children('ul,ol').remove().end().text().trim();
        if (text.length > 0) {
          textParts.push(`- ${text}`);
        }
        break;
      }
      case 'table': {
        const md = tableToMarkdown($, el);
        if (md) {
          textParts.push('\n' + md + '\n');
        }
        break;
      }
      default:
        break;
    }
  });

  // Extract image alt text
  const alts = extractImageAltText($);
  if (alts.length > 0) {
    textParts.push(...alts);
  }

  // Remove duplicate adjacent lines and excessive newlines
  const text = textParts
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Deduplicate: use a Set to remove exact duplicate lines that appear from nested elements
  const lines = text.split('\n');
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '' || !seen.has(trimmed)) {
      seen.add(trimmed);
      deduped.push(line);
    }
  }

  return deduped.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function extractContent(html: string, baseUrl: string): ExtractedContent {
  // Load cheerio for metadata and link extraction (works on the original HTML)
  const $ = cheerio.load(html);

  // Extract title
  const title =
    $('meta[property="og:title"]').attr('content') ||
    $('title').text().trim() ||
    $('h1').first().text().trim() ||
    '';

  // Extract description
  const description =
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') ||
    '';

  // Extract canonical URL
  const canonical = $('link[rel="canonical"]').attr('href') || null;

  // Extract language
  const language = $('html').attr('lang')?.split('-')[0] || 'en';

  // Extract links from the full page (before removing nav/footer)
  const links = extractLinks($, baseUrl);

  // Extract contact info from nav/footer before removing them
  const contactInfo = extractContactInfo($);

  // Extract structured data
  const structuredData = extractStructuredData(html, baseUrl);

  // Try both Readability and cheerio, use whichever extracts more content.
  // Some sites (esp. Korean government portals) have Readability-unfriendly
  // layouts where cheerio extracts significantly more useful text.
  let readabilityText = '';
  try {
    const doc = new JSDOM(html, { url: baseUrl });
    const reader = new Readability(doc.window.document);
    const article = reader.parse();
    if (article && article.textContent && article.textContent.trim().length > 100) {
      readabilityText = article.textContent
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]+/g, ' ')
        .trim();
    }
  } catch {
    // Readability failed
  }

  // Always try cheerio extraction as well
  const $fresh = cheerio.load(html);
  const cheerioText = cheerioExtract($fresh, baseUrl);

  // Use whichever method produced more content
  const useCherio = cheerioText.length > readabilityText.length * 1.5 && cheerioText.length > 200;
  const mainText = useCherio ? cheerioText : (readabilityText || cheerioText);
  console.log(`[extract] ${baseUrl}: readability=${readabilityText.length} cheerio=${cheerioText.length} using=${useCherio ? 'cheerio' : 'readability'} final=${mainText.length}`);

  // Prepend contact info if found
  const textParts: string[] = [];
  if (contactInfo.length > 0) {
    textParts.push(contactInfo.join('\n'));
  }
  textParts.push(mainText);

  const text = textParts.join('\n\n').trim();

  return { title, text, links, description, canonical, language, structuredData };
}
