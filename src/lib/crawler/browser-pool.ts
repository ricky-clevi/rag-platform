import puppeteer, { Browser } from 'puppeteer-core';
import { getProxyLaunchArgs, type CrawlStealthOptions } from './stealth';

const MAX_BROWSERS = 3;
const MAX_PAGES_PER_BROWSER = 50;

interface PooledBrowser {
  browser: Browser;
  pageCount: number;
  inUse: number;
  proxyKey: string;
}

class BrowserPool {
  private browsers: PooledBrowser[] = [];
  private browserPath: string | null = null;

  private async getBrowserPath(): Promise<string> {
    if (this.browserPath) return this.browserPath;

    const isWindows = process.platform === 'win32';

    const paths = [
      process.env.CHROMIUM_PATH || '',
      // Linux/macOS paths
      ...(!isWindows ? [
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      ] : []),
      // Windows paths
      ...(isWindows ? [
        `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
        `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
        `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
        `${process.env.PROGRAMFILES}\\Microsoft\\Edge\\Application\\msedge.exe`,
        `${process.env['PROGRAMFILES(X86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
      ] : []),
    ].filter(Boolean);

    const { existsSync } = await import('fs');
    for (const p of paths) {
      if (existsSync(p)) {
        this.browserPath = p;
        return p;
      }
    }

    try {
      const chromium = await import('chromium');
      this.browserPath = chromium.default.path;
      return this.browserPath;
    } catch {
      throw new Error('No Chromium/Chrome browser found. Set CHROMIUM_PATH environment variable.');
    }
  }

  async acquire(options?: CrawlStealthOptions): Promise<{ browser: Browser; release: () => void }> {
    const proxyKey = options?.proxy_url || '';

    // Find an available browser with capacity
    for (const pooled of this.browsers) {
      if (pooled.proxyKey === proxyKey && pooled.inUse < 2 && pooled.pageCount < MAX_PAGES_PER_BROWSER) {
        pooled.inUse++;
        pooled.pageCount++;
        return {
          browser: pooled.browser,
          release: () => { pooled.inUse--; },
        };
      }
    }

    // Launch new browser if under limit
    if (this.browsers.length < MAX_BROWSERS) {
      const executablePath = await this.getBrowserPath();
      const browser = await puppeteer.launch({
        executablePath,
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--disable-extensions',
          ...getProxyLaunchArgs(options),
        ],
      });
      const pooled: PooledBrowser = { browser, pageCount: 1, inUse: 1, proxyKey };
      this.browsers.push(pooled);
      return {
        browser: pooled.browser,
        release: () => { pooled.inUse--; },
      };
    }

    // Wait for a slot
    await new Promise(resolve => setTimeout(resolve, 1000));
    return this.acquire(options);
  }

  async closeAll(): Promise<void> {
    for (const pooled of this.browsers) {
      try { await pooled.browser.close(); } catch { /* ignore */ }
    }
    this.browsers = [];
  }
}

// Singleton
let pool: BrowserPool | null = null;

export function getBrowserPool(): BrowserPool {
  if (!pool) pool = new BrowserPool();
  return pool;
}

export async function closeBrowserPool(): Promise<void> {
  if (pool) {
    await pool.closeAll();
    pool = null;
  }
}
