import { Page } from 'puppeteer-core';
import { getBrowserPool } from './browser-pool';
import { extractContent, type ExtractedContent } from './content-extractor';
import {
  buildPuppeteerStealthConfig,
  type CrawlStealthOptions,
} from './stealth';

const COOKIE_SELECTORS = [
  '[class*="cookie"] button',
  '[class*="Cookie"] button',
  '[id*="cookie"] button',
  '[id*="Cookie"] button',
  '[class*="consent"] button',
  '[id*="consent"] button',
  '[class*="gdpr"] button',
  '[id*="gdpr"] button',
  '[class*="notice"] button',
  '[class*="banner"] button[class*="accept"]',
  '[class*="banner"] button[class*="agree"]',
  '[class*="banner"] button[class*="close"]',
];

const COOKIE_BUTTON_TEXT_PATTERNS = [
  'accept',
  'agree',
  'consent',
  'ok',
  'got it',
  'i understand',
  'allow',
  'allow all',
  'accept all',
  'close',
  'dismiss',
];

async function dismissCookieBanners(page: Page): Promise<void> {
  try {
    // Try CSS selectors first
    for (const selector of COOKIE_SELECTORS) {
      try {
        const button = await page.$(selector);
        if (button) {
          const isVisible = await button.evaluate((el) => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
          });
          if (isVisible) {
            await button.click().catch(() => {});
            await new Promise(resolve => setTimeout(resolve, 300));
            return;
          }
        }
      } catch { /* continue trying other selectors */ }
    }

    // Try finding buttons by text content
    await page.evaluate((patterns: string[]) => {
      const buttons = Array.from(document.querySelectorAll('button, a[role="button"], [class*="btn"]'));
      for (const btn of buttons) {
        const text = (btn as HTMLElement).innerText?.toLowerCase().trim();
        if (text && patterns.some(p => text === p || text.startsWith(p))) {
          const style = window.getComputedStyle(btn as HTMLElement);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            (btn as HTMLElement).click();
            return;
          }
        }
      }
    }, COOKIE_BUTTON_TEXT_PATTERNS);

    await new Promise(resolve => setTimeout(resolve, 300));
  } catch {
    // Cookie dismissal is best-effort
  }
}

async function scrollForContent(page: Page): Promise<void> {
  try {
    const maxScrolls = 5;
    let previousHeight = 0;

    for (let i = 0; i < maxScrolls; i++) {
      const currentHeight = await page.evaluate(() => document.body.scrollHeight);
      if (currentHeight === previousHeight && i > 0) break;

      previousHeight = currentHeight;
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Scroll back to top so we capture full DOM
    await page.evaluate(() => window.scrollTo(0, 0));
  } catch {
    // Scrolling is best-effort
  }
}

async function waitForDomStability(page: Page, stableMs: number): Promise<void> {
  try {
    await page.evaluate((ms: number) => {
      return new Promise<void>((resolve) => {
        let timer: ReturnType<typeof setTimeout> | null = null;
        const maxWait = setTimeout(() => {
          observer.disconnect();
          resolve();
        }, ms * 3); // Max wait is 3x the stability window

        const observer = new MutationObserver(() => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            observer.disconnect();
            clearTimeout(maxWait);
            resolve();
          }, ms);
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: true,
        });

        // Also resolve if DOM is already stable (no mutations within the window)
        timer = setTimeout(() => {
          observer.disconnect();
          clearTimeout(maxWait);
          resolve();
        }, ms);
      });
    }, stableMs);
  } catch {
    // Fallback: simple wait
    await new Promise(resolve => setTimeout(resolve, stableMs));
  }
}

export async function crawlPageBrowser(
  url: string,
  crawlOptions?: CrawlStealthOptions | null
): Promise<ExtractedContent | null> {
  const pool = getBrowserPool();
  const { browser, release } = await pool.acquire(crawlOptions || undefined);

  try {
    const page = await browser.newPage();

    try {
      const stealthConfig = buildPuppeteerStealthConfig(url, crawlOptions || undefined);

      // Block unnecessary resources
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const type = req.resourceType();
        if (['image', 'font', 'media', 'stylesheet'].includes(type)) {
          req.abort().catch(() => {});
        } else {
          req.continue().catch(() => {});
        }
      });

      await page.setViewport(stealthConfig.viewport);
      await page.setExtraHTTPHeaders(stealthConfig.extraHTTPHeaders);
      await page.setUserAgent(stealthConfig.userAgent);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      // Dismiss cookie banners
      await dismissCookieBanners(page);

      // Scroll for lazy-loaded content
      await scrollForContent(page);

      // Wait for DOM stability
      await waitForDomStability(page, 1000);

      const html = await page.content();
      return extractContent(html, url, { crawlOptions });
    } finally {
      await page.close();
    }
  } catch (error) {
    console.error(`Browser crawl failed for ${url}:`, error instanceof Error ? error.message : error);
    return null;
  } finally {
    release();
  }
}
