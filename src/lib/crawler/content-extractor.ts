import * as cheerio from 'cheerio';

const REMOVE_SELECTORS = [
  'script', 'style', 'noscript', 'iframe', 'svg',
  'nav', 'footer', 'header',
  '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
  '.cookie-banner', '.cookie-notice', '.cookie-consent',
  '.popup', '.modal', '.overlay',
  '.advertisement', '.ad', '.ads', '.adsbygoogle',
  '.sidebar', '.widget',
  '.social-share', '.social-links',
  '#comments', '.comments',
];

export interface ExtractedContent {
  title: string;
  text: string;
  links: string[];
  description: string;
}

export function extractContent(html: string, baseUrl: string): ExtractedContent {
  const $ = cheerio.load(html);

  // Remove unwanted elements
  REMOVE_SELECTORS.forEach((selector) => {
    $(selector).remove();
  });

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

  // Extract main content
  // Try semantic elements first
  let mainContent = $('main, article, [role="main"]');
  if (mainContent.length === 0) {
    mainContent = $('body');
  }

  // Get text content, preserving some structure
  const textParts: string[] = [];

  mainContent.find('h1, h2, h3, h4, h5, h6, p, li, td, th, blockquote, figcaption, dd, dt').each(
    (_, el) => {
      const text = $(el).text().trim();
      if (text.length > 0) {
        const tagName = ('tagName' in el ? (el as unknown as { tagName: string }).tagName : '').toLowerCase();
        if (tagName?.startsWith('h')) {
          textParts.push(`\n## ${text}\n`);
        } else {
          textParts.push(text);
        }
      }
    }
  );

  const text = textParts
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Extract links
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

  return { title, text, links, description };
}
