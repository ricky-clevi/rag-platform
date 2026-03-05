import puppeteer from 'puppeteer-core';
import { extractContent, type ExtractedContent } from './content-extractor';

let browserPath: string | null = null;

async function getBrowserPath(): Promise<string> {
  if (browserPath) return browserPath;

  // Try common chromium paths
  const paths = [
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    process.env.CHROMIUM_PATH || '',
  ].filter(Boolean);

  for (const p of paths) {
    try {
      const { execSync } = await import('child_process');
      execSync(`test -f ${p}`, { stdio: 'ignore' });
      browserPath = p;
      return p;
    } catch {
      continue;
    }
  }

  // Try the chromium npm package
  try {
    const chromium = await import('chromium');
    browserPath = chromium.default.path;
    return browserPath;
  } catch {
    throw new Error('No Chromium browser found. Set CHROMIUM_PATH environment variable.');
  }
}

export async function crawlPageBrowser(
  url: string
): Promise<ExtractedContent | null> {
  let browser = null;

  try {
    const executablePath = await getBrowserPath();

    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
      ],
    });

    const page = await browser.newPage();

    await page.setUserAgent(
      'Mozilla/5.0 (compatible; AgentForgeBot/1.0; +https://agentforge.dev)'
    );

    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // Wait a bit more for dynamic content
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const html = await page.content();
    const extracted = extractContent(html, url);

    return extracted;
  } catch (error) {
    console.error(`Browser crawl failed for ${url}:`, error instanceof Error ? error.message : error);
    return null;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
