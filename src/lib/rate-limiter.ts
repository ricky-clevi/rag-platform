/**
 * In-memory sliding window rate limiter.
 * Tracks request counts per key (IP, token, etc.) within a time window.
 */

interface RateLimitEntry {
  timestamps: number[];
  blocked_until?: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter((t) => now - t < 3600_000);
    if (entry.timestamps.length === 0 && (!entry.blocked_until || entry.blocked_until < now)) {
      store.delete(key);
    }
  }
}, 300_000);

export interface RateLimitConfig {
  /** Maximum requests allowed in the window */
  maxRequests: number;
  /** Window size in milliseconds */
  windowMs: number;
  /** Block duration in ms after limit is exceeded (default: same as windowMs) */
  blockDurationMs?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs?: number;
}

export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  const entry = store.get(key) || { timestamps: [] };

  // Check if currently blocked
  if (entry.blocked_until && entry.blocked_until > now) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: entry.blocked_until - now,
    };
  }

  // Clean old timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => now - t < config.windowMs);

  if (entry.timestamps.length >= config.maxRequests) {
    // Rate limit exceeded — block
    entry.blocked_until = now + (config.blockDurationMs || config.windowMs);
    store.set(key, entry);
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: config.blockDurationMs || config.windowMs,
    };
  }

  // Allow the request
  entry.timestamps.push(now);
  store.set(key, entry);

  return {
    allowed: true,
    remaining: config.maxRequests - entry.timestamps.length,
  };
}

/** Default rate limit configs */
export const RATE_LIMITS = {
  /** Chat API: 30 messages per minute per IP */
  chat: {
    maxRequests: 30,
    windowMs: 60_000,
    blockDurationMs: 60_000,
  } satisfies RateLimitConfig,

  /** Chat API per agent+session: 60 messages per minute */
  chatSession: {
    maxRequests: 60,
    windowMs: 60_000,
    blockDurationMs: 30_000,
  } satisfies RateLimitConfig,

  /** Share link views: 100 per hour per IP */
  shareView: {
    maxRequests: 100,
    windowMs: 3600_000,
    blockDurationMs: 3600_000,
  } satisfies RateLimitConfig,

  /** Agent creation: 10 per hour per user */
  agentCreation: {
    maxRequests: 10,
    windowMs: 3600_000,
    blockDurationMs: 3600_000,
  } satisfies RateLimitConfig,

  /** Crawl triggers: 5 per hour per agent */
  crawlTrigger: {
    maxRequests: 5,
    windowMs: 3600_000,
    blockDurationMs: 3600_000,
  } satisfies RateLimitConfig,
};

/**
 * Extract client IP from request headers.
 * WARNING: x-forwarded-for and x-real-ip are only trustworthy behind a
 * trusted reverse proxy (e.g., Vercel, Cloudflare, nginx). If running
 * without a proxy, these headers can be spoofed by clients.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    // Take only the first (leftmost) IP — the one set by the trusted proxy
    const ip = forwarded.split(',')[0].trim();
    // Basic validation: must look like an IP address
    if (/^[\d.:a-fA-F]+$/.test(ip)) return ip;
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp && /^[\d.:a-fA-F]+$/.test(realIp)) return realIp;
  return '127.0.0.1';
}

/**
 * Simple bot detection heuristics.
 */
export function isLikelyBot(request: Request): boolean {
  const ua = request.headers.get('user-agent') || '';
  if (!ua) return true;

  const botPatterns = [
    /bot/i, /crawler/i, /spider/i, /scraper/i,
    /curl/i, /wget/i, /python-requests/i, /httpie/i,
    /go-http-client/i, /java\//i, /libwww/i,
  ];

  // Known browser agents are OK
  const browserPatterns = [/mozilla/i, /chrome/i, /safari/i, /firefox/i, /edge/i, /opera/i];
  const isBrowser = browserPatterns.some((p) => p.test(ua));

  if (isBrowser) return false;
  return botPatterns.some((p) => p.test(ua));
}
