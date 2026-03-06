import puppeteer, { Browser } from 'puppeteer-core';

const MAX_BROWSERS = 3;
const MAX_PAGES_PER_BROWSER = 50;

interface PooledBrowser {
  browser: Browser;
  pageCount: number;
  inUse: number;
}

class BrowserPool {
  private browsers: PooledBrowser[] = [];
  private browserPath: string | null = null;

  private async getBrowserPath(): Promise<string> {
    if (this.browserPath) return this.browserPath;
    const paths = [
      process.env.CHROMIUM_PATH || '',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
    ].filter(Boolean);

    for (const p of paths) {
      try {
        const { execSync } = await import('child_process');
        execSync(`test -f ${p}`, { stdio: 'ignore' });
        this.browserPath = p;
        return p;
      } catch { continue; }
    }

    try {
      const chromium = await import('chromium');
      this.browserPath = chromium.default.path;
      return this.browserPath;
    } catch {
      throw new Error('No Chromium browser found. Set CHROMIUM_PATH environment variable.');
    }
  }

  async acquire(): Promise<{ browser: Browser; release: () => void }> {
    // Find an available browser with capacity
    for (const pooled of this.browsers) {
      if (pooled.inUse < 2 && pooled.pageCount < MAX_PAGES_PER_BROWSER) {
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
        ],
      });
      const pooled: PooledBrowser = { browser, pageCount: 1, inUse: 1 };
      this.browsers.push(pooled);
      return {
        browser: pooled.browser,
        release: () => { pooled.inUse--; },
      };
    }

    // Wait for a slot
    await new Promise(resolve => setTimeout(resolve, 1000));
    return this.acquire();
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
