export interface CrawlStealthOptions {
  stealth_mode?: boolean;
  proxy_url?: string;
  enable_ocr?: boolean;
  max_images_ocr?: number;
  enable_table_descriptions?: boolean;
  enable_youtube_transcripts?: boolean;
}

export interface StealthProfile {
  userAgent: string;
  viewport: {
    width: number;
    height: number;
    deviceScaleFactor: number;
  };
  locale: string;
  platform: string;
}

const DESKTOP_USER_AGENTS = [
  {
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
    platform: 'Win32',
  },
  {
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
    platform: 'MacIntel',
  },
  {
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
    platform: 'Linux x86_64',
  },
] as const;

const VIEWPORT_PRESETS = [
  { width: 1366, height: 768, deviceScaleFactor: 1 },
  { width: 1440, height: 900, deviceScaleFactor: 1 },
  { width: 1536, height: 864, deviceScaleFactor: 1 },
  { width: 1600, height: 900, deviceScaleFactor: 1 },
  { width: 1728, height: 1117, deviceScaleFactor: 1.25 },
] as const;

const DEFAULT_FETCH_HEADERS: Record<string, string> = {
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
  'Upgrade-Insecure-Requests': '1',
};

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalizeOptions(options?: CrawlStealthOptions): Required<CrawlStealthOptions> {
  return {
    stealth_mode: options?.stealth_mode ?? false,
    proxy_url: options?.proxy_url ?? '',
    enable_ocr: options?.enable_ocr ?? false,
    max_images_ocr: Math.max(0, Math.min(options?.max_images_ocr ?? 3, 10)),
    enable_table_descriptions: options?.enable_table_descriptions ?? false,
    enable_youtube_transcripts: options?.enable_youtube_transcripts ?? false,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function jitter(base: number, variance: number, seed: number): number {
  const offset = (seed % (variance * 2 + 1)) - variance;
  return base + offset;
}

export function getDesktopUserAgents(): readonly string[] {
  return DESKTOP_USER_AGENTS.map((entry) => entry.userAgent);
}

export function isStealthEnabled(options?: CrawlStealthOptions): boolean {
  return Boolean(options?.stealth_mode);
}

export function getStealthProfile(
  seed: string,
  options?: CrawlStealthOptions
): StealthProfile {
  const normalized = normalizeOptions(options);

  if (!normalized.stealth_mode) {
    return {
      userAgent:
        'Mozilla/5.0 (compatible; AgentForgeBot/1.0; +https://agentforge.dev)',
      viewport: {
        width: 1440,
        height: 900,
        deviceScaleFactor: 1,
      },
      locale: 'en-US,en;q=0.9',
      platform: 'Win32',
    };
  }

  const hash = hashSeed(seed || 'agentforge');
  const ua = DESKTOP_USER_AGENTS[hash % DESKTOP_USER_AGENTS.length];
  const preset = VIEWPORT_PRESETS[(hash >>> 8) % VIEWPORT_PRESETS.length];

  return {
    userAgent: ua.userAgent,
    viewport: {
      width: clamp(jitter(preset.width, 24, hash >>> 12), 1280, 1920),
      height: clamp(jitter(preset.height, 18, hash >>> 16), 720, 1200),
      deviceScaleFactor: preset.deviceScaleFactor,
    },
    locale: 'en-US,en;q=0.9',
    platform: ua.platform,
  };
}

export function getRandomStealthProfile(
  options?: CrawlStealthOptions,
  randomValue: number = Math.random()
): StealthProfile {
  const seed = String(Math.floor(randomValue * 1_000_000_000));
  return getStealthProfile(seed, options);
}

export function buildStealthFetchHeaders(
  url: string,
  options?: CrawlStealthOptions,
  extraHeaders?: Record<string, string>
): Record<string, string> {
  const profile = getStealthProfile(url, options);
  const headers: Record<string, string> = {
    ...DEFAULT_FETCH_HEADERS,
    'User-Agent': profile.userAgent,
    ...extraHeaders,
  };

  try {
    const parsed = new URL(url);
    headers['Sec-Fetch-Dest'] = 'document';
    headers['Sec-Fetch-Mode'] = 'navigate';
    headers['Sec-Fetch-Site'] = 'none';
    headers['Sec-Fetch-User'] = '?1';
    headers.Referer = `${parsed.protocol}//${parsed.host}/`;
  } catch {
    // Leave URL-derived headers unset when parsing fails.
  }

  return headers;
}

export function buildPuppeteerStealthConfig(
  url: string,
  options?: CrawlStealthOptions
): {
  userAgent: string;
  viewport: { width: number; height: number; deviceScaleFactor: number };
  extraHTTPHeaders: Record<string, string>;
} {
  const profile = getStealthProfile(url, options);

  return {
    userAgent: profile.userAgent,
    viewport: profile.viewport,
    extraHTTPHeaders: {
      'Accept-Language': profile.locale,
      'Upgrade-Insecure-Requests': '1',
    },
  };
}

export function getProxyLaunchArgs(options?: CrawlStealthOptions): string[] {
  const normalized = normalizeOptions(options);
  return normalized.proxy_url ? [`--proxy-server=${normalized.proxy_url}`] : [];
}

export function sanitizeCrawlStealthOptions(
  options?: CrawlStealthOptions | null
): Required<CrawlStealthOptions> {
  return normalizeOptions(options || undefined);
}
