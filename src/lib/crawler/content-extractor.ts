import * as cheerio from 'cheerio';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { DEFAULT_CHAT_MODEL, tryGetGeminiClient } from '@/lib/gemini/client';
import { extractStructuredData, type StructuredData } from './structured-data';
import type { AgentCrawlOptions } from '@/types';

const REMOVE_SELECTORS = [
  'script', 'style', 'noscript', 'iframe', 'svg',
  '.cookie-banner', '.cookie-notice', '.cookie-consent',
  '.popup', '.modal', '.overlay',
  '.advertisement', '.ad', '.ads', '.adsbygoogle',
  '.social-share', '.social-links',
  '#comments', '.comments',
] as const;

const NAV_FOOTER_SELECTORS = [
  'nav', 'footer', 'header',
  '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
  '.sidebar', '.widget',
] as const;

const MAX_HTML_FOR_LLM = 18_000;
const MAX_TABLES = 5;
const MAX_YOUTUBE_PER_PAGE = 3;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type ExtractionMethod = 'readability' | 'cheerio' | 'llm';

export interface ExtractedContent {
  title: string;
  text: string;
  links: string[];
  description: string;
  canonical: string | null;
  language: string;
  structuredData?: StructuredData;
  extractionMethod: ExtractionMethod;
  qualityScore: number;
}

export interface ExtractContentOptions {
  crawlOptions?: AgentCrawlOptions | null;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function stripMarkdown(value: string): string {
  return value
    .replace(/#{1,6}\s/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[>\-]{2,}/g, ' ')
    .trim();
}

function extractContactInfo($: cheerio.CheerioAPI): string[] {
  const contactParts: string[] = [];
  const navFooterHtml = NAV_FOOTER_SELECTORS.map((selector) => {
    const elements: string[] = [];
    $(selector).each((_, el) => {
      elements.push($(el).text());
    });
    return elements.join(' ');
  }).join(' ');

  const phoneRegex = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g;
  const phones = navFooterHtml.match(phoneRegex);
  if (phones) {
    for (const phone of [...new Set(phones.map((value) => value.trim()))]) {
      contactParts.push(`Phone: ${phone}`);
    }
  }

  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const emails = $('body').text().match(emailRegex);
  if (emails) {
    for (const email of [...new Set(emails)]) {
      contactParts.push(`Email: ${email}`);
    }
  }

  return contactParts;
}

function extractLinks($: cheerio.CheerioAPI, baseUrl: string): string[] {
  const links: string[] = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    try {
      links.push(new URL(href, baseUrl).toString());
    } catch {
      // Skip malformed URLs.
    }
  });
  return links;
}

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

function tableToMarkdown(
  $: cheerio.CheerioAPI,
  table: Parameters<ReturnType<typeof cheerio.load>>[0]
): string {
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

  const maxCols = Math.max(...rows.map((row) => row.length));
  const normalizedRows = rows.map((row) => {
    while (row.length < maxCols) row.push('');
    return row;
  });

  const lines: string[] = [];
  lines.push(`| ${normalizedRows[0].join(' | ')} |`);
  lines.push(`| ${normalizedRows[0].map(() => '---').join(' | ')} |`);

  for (let i = 1; i < normalizedRows.length; i++) {
    lines.push(`| ${normalizedRows[i].join(' | ')} |`);
  }

  return lines.join('\n');
}

function cheerioExtract($: cheerio.CheerioAPI): string {
  REMOVE_SELECTORS.forEach((selector) => {
    $(selector).remove();
  });
  NAV_FOOTER_SELECTORS.forEach((selector) => {
    $(selector).remove();
  });

  let mainContent = $('main, article, [role="main"]');
  if (mainContent.length === 0) {
    mainContent = $('body');
  }

  const textParts: string[] = [];

  mainContent.find('*').each((_, el) => {
    const tagName = ('tagName' in el ? (el as { tagName: string }).tagName : '').toLowerCase();
    const $el = $(el);
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
        const text = $el
          .clone()
          .children('h1,h2,h3,h4,h5,h6,p,table,ul,ol,blockquote,div')
          .remove()
          .end()
          .text()
          .trim();
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
        const markdown = tableToMarkdown($, el);
        if (markdown) {
          textParts.push(`\n${markdown}\n`);
        }
        break;
      }
      default:
        break;
    }
  });

  const text = [...textParts, ...extractImageAltText($)].join('\n');
  const lines = text.split('\n');
  const deduped: string[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '' || !seen.has(trimmed)) {
      seen.add(trimmed);
      deduped.push(line);
    }
  }

  return normalizeWhitespace(deduped.join('\n'));
}

function scoreExtraction(text: string, html: string): number {
  const stripped = stripMarkdown(text);
  if (!stripped) return 0.05;

  const wordCount = stripped.split(/\s+/).filter(Boolean).length;
  const sentenceCount = Math.max(1, stripped.split(/[.!?]\s+/).filter(Boolean).length);
  const avgSentenceLength = wordCount / sentenceCount;
  const lineCount = text.split('\n').filter((line) => line.trim().length > 0).length;
  const uniqueWords = new Set(stripped.toLowerCase().split(/\s+/).filter(Boolean)).size;
  const lexicalDiversity = uniqueWords / Math.max(wordCount, 1);
  const htmlDensity = stripped.length / Math.max(html.length, 1);
  const linkPenalty = Math.min((text.match(/https?:\/\//g) || []).length / 20, 0.25);

  return Math.max(
    0,
    Math.min(
      1,
      0.28 * Math.min(wordCount / 350, 1)
        + 0.2 * Math.min(avgSentenceLength / 18, 1)
        + 0.18 * Math.min(lineCount / 18, 1)
        + 0.18 * Math.min(lexicalDiversity / 0.55, 1)
        + 0.16 * Math.min(htmlDensity * 10, 1)
        - linkPenalty
    )
  );
}

function shouldUseLlmCleanup(
  qualityScore: number,
  html: string,
  extractedText: string
): boolean {
  return qualityScore < 0.42 && html.length > 4_000 && stripMarkdown(extractedText).length < 8_000;
}

async function cleanHtmlWithLlm(
  html: string,
  baseUrl: string,
  title: string
): Promise<string | null> {
  const prompt = `Clean the following raw HTML from ${baseUrl} into concise markdown.

Rules:
- Keep only user-visible informational content.
- Remove navigation, cookie prompts, and duplicated boilerplate.
- Preserve headings, lists, key tables, and contact details.
- Do not invent content.
- Return markdown only.

Page title: ${title || baseUrl}

HTML:
${html.slice(0, MAX_HTML_FOR_LLM)}`;

  try {
    const client = tryGetGeminiClient();
    if (!client) return null;

    const result = await Promise.race([
      client.models.generateContent({
        model: DEFAULT_CHAT_MODEL,
        contents: prompt,
        config: {
          temperature: 0.1,
          maxOutputTokens: 2048,
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('LLM cleanup timed out')), 20_000)
      ),
    ]);

    const text = normalizeWhitespace(result.text || '');
    return text.length > 80 ? text : null;
  } catch {
    return null;
  }
}

function isSameOriginAsset(assetUrl: string, baseUrl: string): boolean {
  try {
    const asset = new URL(assetUrl, baseUrl);
    const base = new URL(baseUrl);
    return asset.origin === base.origin;
  } catch {
    return false;
  }
}

async function extractOcrTextForImages(
  $: cheerio.CheerioAPI,
  baseUrl: string,
  crawlOptions?: AgentCrawlOptions | null
): Promise<string[]> {
  if (!crawlOptions?.enable_ocr) {
    return [];
  }

  const maxImages = Math.max(0, Math.min(crawlOptions.max_images_ocr ?? 3, 10));
  if (maxImages === 0) {
    return [];
  }

  const imageUrls = $('img[src]')
    .toArray()
    .map((el) => $(el).attr('src'))
    .filter((src): src is string => typeof src === 'string' && src.length > 0)
    .map((src) => {
      try {
        return new URL(src, baseUrl).toString();
      } catch {
        return null;
      }
    })
    .filter((src): src is string => Boolean(src))
    .filter((src, index, all) => all.indexOf(src) === index)
    .filter((src) => isSameOriginAsset(src, baseUrl))
    .slice(0, maxImages);

  const client = tryGetGeminiClient();
  if (!client) {
    return [];
  }
  const results: string[] = [];

  for (const imageUrl of imageUrls) {
    try {
      const response = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) continue;

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.startsWith('image/')) continue;

      const arrayBuffer = await response.arrayBuffer();
      if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) continue;

      const result = await Promise.race([
        client.models.generateContent({
          model: DEFAULT_CHAT_MODEL,
          contents: [{
            role: 'user',
            parts: [
              { text: 'Extract only the useful visible text from this image. Return plain text, or "NONE" if there is no meaningful text.' },
              {
                inlineData: {
                  mimeType: contentType,
                  data: Buffer.from(arrayBuffer).toString('base64'),
                },
              },
            ],
          }],
          config: {
            temperature: 0,
            maxOutputTokens: 300,
          },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('OCR timed out')), 30_000)
        ),
      ]);

      const text = normalizeWhitespace(result.text || '');
      if (text && text.toUpperCase() !== 'NONE') {
        results.push(`[Image OCR] ${text}`);
      }
    } catch {
      // OCR is best-effort only.
    }
  }

  return results;
}

function isComplexTable(
  $: cheerio.CheerioAPI,
  table: Parameters<ReturnType<typeof cheerio.load>>[0]
): boolean {
  const rows = $(table).find('tr');
  const rowCount = rows.length;
  let maxCols = 0;
  let longestCell = 0;

  rows.each((_, row) => {
    const cells = $(row).find('th, td');
    maxCols = Math.max(maxCols, cells.length);
    cells.each((__, cell) => {
      longestCell = Math.max(longestCell, $(cell).text().trim().length);
    });
  });

  return rowCount >= 6 || maxCols >= 5 || longestCell >= 80;
}

async function describeComplexTables(
  $: cheerio.CheerioAPI,
  baseUrl: string,
  crawlOptions?: AgentCrawlOptions | null
): Promise<string[]> {
  if (!crawlOptions?.enable_table_descriptions) {
    return [];
  }

  const client = tryGetGeminiClient();
  if (!client) {
    return [];
  }
  const tables = $('table').toArray().filter((table) => isComplexTable($, table)).slice(0, MAX_TABLES);
  const summaries: string[] = [];

  for (const table of tables) {
    try {
      const html = $.html(table).slice(0, 10_000);
      const result = await Promise.race([
        client.models.generateContent({
          model: DEFAULT_CHAT_MODEL,
          contents: `Summarize this HTML table from ${baseUrl} in 3 concise bullet points. Focus on the key rows, comparisons, and numeric takeaways. Return markdown bullets only.\n\n${html}`,
          config: {
            temperature: 0.1,
            maxOutputTokens: 512,
          },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Table summary timed out')), 20_000)
        ),
      ]);

      const text = normalizeWhitespace(result.text || '');
      if (text) {
        summaries.push(`Table summary:\n${text}`);
      }
    } catch {
      // Table summarization is best-effort.
    }
  }

  return summaries;
}

function collectYoutubeVideoIds($: cheerio.CheerioAPI, baseUrl: string): string[] {
  const ids = new Set<string>();

  const candidates = [
    ...$('iframe[src], a[href]').toArray().map((el) => $(el).attr('src') || $(el).attr('href') || ''),
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const resolved = new URL(candidate, baseUrl);
      if (!resolved.hostname.includes('youtube.com') && !resolved.hostname.includes('youtu.be')) {
        continue;
      }

      let videoId = '';
      if (resolved.hostname.includes('youtu.be')) {
        videoId = resolved.pathname.replace('/', '');
      } else if (resolved.pathname.startsWith('/embed/')) {
        videoId = resolved.pathname.split('/embed/')[1];
      } else {
        videoId = resolved.searchParams.get('v') || '';
      }

      if (videoId) {
        ids.add(videoId);
      }
    } catch {
      // Ignore malformed URLs.
    }
  }

  return [...ids].slice(0, MAX_YOUTUBE_PER_PAGE);
}

function decodeYoutubeTranscript(xml: string): string {
  const entries = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map((match) =>
    cheerio.load(`<div>${match[1]}</div>`)('div').text()
  );
  return normalizeWhitespace(entries.join(' '));
}

async function fetchYoutubeTranscript(videoId: string): Promise<string | null> {
  try {
    const watchResponse = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      signal: AbortSignal.timeout(20_000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AgentForgeBot/1.0)' },
    });

    if (!watchResponse.ok) return null;
    const html = await watchResponse.text();
    const captionsMatch = html.match(/"captionTracks":(\[[^\]]+\])/);
    if (!captionsMatch) return null;

    const captionTracks = JSON.parse(captionsMatch[1]) as Array<{ baseUrl?: string }>;
    const captionUrl = captionTracks.find((track) => track.baseUrl)?.baseUrl;
    if (!captionUrl) return null;

    const transcriptResponse = await fetch(captionUrl, {
      signal: AbortSignal.timeout(20_000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AgentForgeBot/1.0)' },
    });
    if (!transcriptResponse.ok) return null;

    const transcriptXml = await transcriptResponse.text();
    const transcript = decodeYoutubeTranscript(transcriptXml);
    return transcript.length > 0 ? transcript : null;
  } catch {
    return null;
  }
}

async function extractYoutubeTranscripts(
  $: cheerio.CheerioAPI,
  baseUrl: string,
  crawlOptions?: AgentCrawlOptions | null
): Promise<string[]> {
  if (!crawlOptions?.enable_youtube_transcripts) {
    return [];
  }

  const transcripts: string[] = [];
  for (const videoId of collectYoutubeVideoIds($, baseUrl)) {
    const transcript = await fetchYoutubeTranscript(videoId);
    if (transcript) {
      transcripts.push(`[YouTube transcript] ${transcript.slice(0, 3_500)}`);
    }
  }

  return transcripts;
}

export async function extractContent(
  html: string,
  baseUrl: string,
  options: ExtractContentOptions = {}
): Promise<ExtractedContent> {
  const $ = cheerio.load(html);
  const title =
    $('meta[property="og:title"]').attr('content')
    || $('title').text().trim()
    || $('h1').first().text().trim()
    || '';
  const description =
    $('meta[name="description"]').attr('content')
    || $('meta[property="og:description"]').attr('content')
    || '';
  const canonical = $('link[rel="canonical"]').attr('href') || null;
  const language = $('html').attr('lang')?.split('-')[0] || 'en';
  const links = extractLinks($, baseUrl);
  const contactInfo = extractContactInfo($);
  const structuredData = extractStructuredData(html, baseUrl);

  let readabilityText = '';
  try {
    const doc = new JSDOM(html, { url: baseUrl });
    const article = new Readability(doc.window.document).parse();
    if (article?.textContent && article.textContent.trim().length > 100) {
      readabilityText = normalizeWhitespace(article.textContent);
    }
  } catch {
    // Readability is best-effort.
  }

  const cheerioText = cheerioExtract(cheerio.load(html));
  let mainText = readabilityText;
  let extractionMethod: ExtractionMethod = 'readability';

  if (!mainText || cheerioText.length > readabilityText.length * 1.35) {
    mainText = cheerioText;
    extractionMethod = 'cheerio';
  }

  const textParts: string[] = [];
  if (contactInfo.length > 0) {
    textParts.push(contactInfo.join('\n'));
  }
  if (mainText) {
    textParts.push(mainText);
  }

  const multimodalParts = await Promise.all([
    describeComplexTables($, baseUrl, options.crawlOptions),
    extractOcrTextForImages($, baseUrl, options.crawlOptions),
    extractYoutubeTranscripts($, baseUrl, options.crawlOptions),
  ]);

  const text = normalizeWhitespace([...textParts, ...multimodalParts.flat()].join('\n\n'));
  let qualityScore = scoreExtraction(text, html);

  if (shouldUseLlmCleanup(qualityScore, html, text)) {
    const llmText = await cleanHtmlWithLlm(html, baseUrl, title || baseUrl);
    if (llmText) {
      const llmCombined = normalizeWhitespace(
        [contactInfo.join('\n'), llmText, ...multimodalParts.flat()].filter(Boolean).join('\n\n')
      );
      const llmScore = scoreExtraction(llmCombined, html);
      if (llmScore >= qualityScore) {
        qualityScore = llmScore;
        extractionMethod = 'llm';
        return {
          title,
          text: llmCombined,
          links,
          description,
          canonical,
          language,
          structuredData,
          extractionMethod,
          qualityScore,
        };
      }
    }
  }

  console.log(
    `[extract] ${baseUrl}: readability=${readabilityText.length} cheerio=${cheerioText.length} method=${extractionMethod} quality=${qualityScore.toFixed(2)}`
  );

  return {
    title,
    text,
    links,
    description,
    canonical,
    language,
    structuredData,
    extractionMethod,
    qualityScore,
  };
}
