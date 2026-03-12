'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Globe, FileText, AlertTriangle, Clock, CheckCircle2, Loader2, Zap } from 'lucide-react';

interface CrawlEvent {
  type: string;
  url?: string;
  title?: string;
  crawled_count?: number;
  processed_count?: number;
  skipped_count?: number;
  total_discovered?: number;
  chunks_created?: number;
  total_pages?: number;
  total_chunks?: number;
  errors?: number;
  pages_per_minute?: number;
  eta_seconds?: number | null;
  started_at?: string;
  message?: string;
  error?: string;
}

interface CrawlStatusPayload {
  status?: string;
  crawl_stats?: {
    started_at?: string;
    crawled_pages?: number;
    total_pages?: number;
    total_chunks?: number;
    errors?: number;
    discovered_urls?: number;
    pages_per_minute?: number;
    eta_seconds?: number | null;
    error_message?: string;
  };
  metrics?: {
    crawled_urls?: number;
    discovered_urls?: number;
    failed_urls?: number;
    skipped_urls?: number;
    total_chunks?: number;
    pages_per_minute?: number;
    eta_seconds?: number | null;
  };
}

interface CrawlStatsState {
  crawled: number;
  processed: number;
  skipped: number;
  discovered: number;
  chunks: number;
  errors: number;
  pagesPerMinute: number;
  etaSeconds: number | null;
}

interface CrawlProgressProps {
  agentId: string;
  onComplete: () => void;
}

const DEFAULT_STATS: CrawlStatsState = {
  crawled: 0,
  processed: 0,
  skipped: 0,
  discovered: 0,
  chunks: 0,
  errors: 0,
  pagesPerMinute: 0,
  etaSeconds: null,
};

function toFiniteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function CrawlProgress({ agentId, onComplete }: CrawlProgressProps) {
  const t = useTranslations('agents');
  const [events, setEvents] = useState<CrawlEvent[]>([]);
  const [stats, setStats] = useState<CrawlStatsState>(DEFAULT_STATS);
  const [status, setStatus] = useState<'connecting' | 'crawling' | 'completed' | 'failed'>('connecting');
  const [errorMessage, setErrorMessage] = useState('');
  const [mountedAt] = useState(() => Date.now());
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [currentUrl, setCurrentUrl] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const completedRef = useRef(false);

  const completeAndRedirect = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    setTimeout(() => onComplete(), 2000);
  }, [onComplete]);

  // Tick every second for elapsed time display.
  useEffect(() => {
    timerRef.current = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const effectiveStartMs = startedAtMs ?? mountedAt;
  const elapsed = Math.max(now - effectiveStartMs, 0);
  const elapsedMinutes = Math.floor(elapsed / 60000);
  const elapsedSeconds = Math.floor((elapsed % 60000) / 1000);
  const effectiveDiscovered = Math.max(
    stats.discovered,
    stats.processed,
    stats.crawled + stats.errors + stats.skipped
  );
  const rawProgress = effectiveDiscovered > 0
    ? (stats.processed / effectiveDiscovered) * 100
    : 0;
  const progressValue =
    status === 'completed'
      ? 100
      : Math.max(0, Math.min(Math.round(rawProgress), status === 'failed' ? 100 : 99));
  const elapsedMins = elapsed / 60000;
  const pagesPerMinute =
    stats.pagesPerMinute > 0
      ? stats.pagesPerMinute
      : elapsedMins > 0.1
        ? Math.max(1, Math.round(stats.processed / elapsedMins))
        : 0;
  const etaSeconds =
    stats.etaSeconds != null
      ? stats.etaSeconds
      : pagesPerMinute > 0 && effectiveDiscovered > stats.processed
        ? Math.ceil(((effectiveDiscovered - stats.processed) / pagesPerMinute) * 60)
        : null;
  const etaMinutes = etaSeconds == null ? null : Math.ceil(etaSeconds / 60);

  const formatElapsed = useCallback(() => {
    if (elapsedMinutes > 0) {
      return `${elapsedMinutes}m ${elapsedSeconds}s`;
    }
    return `${elapsedSeconds}s`;
  }, [elapsedMinutes, elapsedSeconds]);

  // Auto-scroll the log.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  const applyStatusSnapshot = useCallback((data: CrawlStatusPayload) => {
    const crawlStats = data.crawl_stats ?? {};
    const metrics = data.metrics ?? {};

    if (typeof crawlStats.started_at === 'string') {
      const parsedStart = Date.parse(crawlStats.started_at);
      if (Number.isFinite(parsedStart)) {
        setStartedAtMs(parsedStart);
      }
    }

    setStats((prev) => {
      const hasCrawled =
        metrics.crawled_urls != null || crawlStats.crawled_pages != null;
      const hasErrors =
        metrics.failed_urls != null || crawlStats.errors != null;
      const hasSkipped = metrics.skipped_urls != null;
      const hasDiscovered =
        metrics.discovered_urls != null
        || crawlStats.discovered_urls != null
        || crawlStats.total_pages != null;
      const hasChunks =
        metrics.total_chunks != null || crawlStats.total_chunks != null;
      const hasPagesPerMinute =
        metrics.pages_per_minute != null || crawlStats.pages_per_minute != null;
      const hasEta =
        metrics.eta_seconds !== undefined || crawlStats.eta_seconds !== undefined;

      const nextCrawled = hasCrawled
        ? toFiniteNumber(metrics.crawled_urls ?? crawlStats.crawled_pages, prev.crawled)
        : prev.crawled;
      const nextErrors = hasErrors
        ? toFiniteNumber(metrics.failed_urls ?? crawlStats.errors, prev.errors)
        : prev.errors;
      const nextSkipped = hasSkipped
        ? toFiniteNumber(metrics.skipped_urls, prev.skipped)
        : prev.skipped;
      const nextDiscovered = hasDiscovered
        ? Math.max(
            toFiniteNumber(
              metrics.discovered_urls
                ?? crawlStats.discovered_urls
                ?? crawlStats.total_pages,
              prev.discovered
            ),
            nextCrawled + nextErrors + nextSkipped
          )
        : prev.discovered;
      const nextChunks = hasChunks
        ? toFiniteNumber(metrics.total_chunks ?? crawlStats.total_chunks, prev.chunks)
        : prev.chunks;
      const nextPagesPerMinute = hasPagesPerMinute
        ? toFiniteNumber(
            metrics.pages_per_minute ?? crawlStats.pages_per_minute,
            prev.pagesPerMinute
          )
        : prev.pagesPerMinute;
      const etaSource = metrics.eta_seconds ?? crawlStats.eta_seconds;

      return {
        crawled: nextCrawled,
        processed: Math.max(prev.processed, nextCrawled + nextErrors + nextSkipped),
        skipped: nextSkipped,
        discovered: nextDiscovered,
        chunks: nextChunks,
        errors: nextErrors,
        pagesPerMinute: nextPagesPerMinute,
        etaSeconds: hasEta
          ? (etaSource == null ? null : toFiniteNumber(etaSource, 0))
          : prev.etaSeconds,
      };
    });

    if (data.status === 'ready') {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      setStatus('completed');
      completeAndRedirect();
      return;
    }

    if (data.status === 'error') {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      setStatus('failed');
      setErrorMessage(crawlStats.error_message || 'Crawl failed');
      return;
    }

    if (data.status === 'crawling' || data.status === 'processing') {
      setStatus('crawling');
      return;
    }

    setStatus('connecting');
  }, [completeAndRedirect]);

  const handleEvent = useCallback((event: CrawlEvent) => {
    if (event.type === 'heartbeat') {
      return;
    }

    if (typeof event.started_at === 'string') {
      const parsedStart = Date.parse(event.started_at);
      if (Number.isFinite(parsedStart)) {
        setStartedAtMs(parsedStart);
      }
    }

    if (event.type === 'connected') {
      setStatus((prev) => (prev === 'completed' || prev === 'failed' ? prev : 'crawling'));
      return;
    }

    if (event.type === 'page_crawled' || event.type === 'progress' || event.type === 'error_page') {
      setStatus('crawling');
      setStats((prev) => {
        const nextCrawled = event.crawled_count ?? prev.crawled;
        const nextErrors = event.errors ?? (event.type === 'error_page' ? prev.errors + 1 : prev.errors);
        const nextSkipped = event.skipped_count ?? prev.skipped;
        const nextDiscovered = event.total_discovered != null
          ? Math.max(event.total_discovered, nextCrawled + nextErrors + nextSkipped, prev.discovered)
          : prev.discovered;
        const nextProcessed = event.processed_count != null
          ? Math.max(event.processed_count, prev.processed)
          : Math.max(prev.processed, nextCrawled + nextErrors + nextSkipped);

        return {
          crawled: nextCrawled,
          processed: nextProcessed,
          skipped: nextSkipped,
          discovered: nextDiscovered,
          chunks: event.chunks_created ?? event.total_chunks ?? prev.chunks,
          errors: nextErrors,
          pagesPerMinute: event.pages_per_minute ?? prev.pagesPerMinute,
          etaSeconds: event.eta_seconds !== undefined ? event.eta_seconds : prev.etaSeconds,
        };
      });

      if ((event.type === 'page_crawled' || event.type === 'error_page') && event.url) {
        setCurrentUrl(event.url);
        setEvents((prev) => {
          const next = [...prev, event];
          return next.length > 100 ? next.slice(-100) : next;
        });
      }

      return;
    }

    if (event.type === 'completed') {
      setStatus('completed');
      setStats((prev) => {
        const finalCrawled = event.total_pages ?? event.crawled_count ?? prev.crawled;
        const finalDiscovered = Math.max(
          event.total_discovered ?? event.processed_count ?? prev.discovered,
          finalCrawled
        );

        return {
          crawled: finalCrawled,
          processed: event.processed_count ?? finalDiscovered,
          skipped: event.skipped_count ?? prev.skipped,
          discovered: finalDiscovered,
          chunks: event.total_chunks ?? event.chunks_created ?? prev.chunks,
          errors: event.errors ?? prev.errors,
          pagesPerMinute: event.pages_per_minute ?? prev.pagesPerMinute,
          etaSeconds: 0,
        };
      });
      completeAndRedirect();
      return;
    }

    if (event.type === 'failed' || event.type === 'error') {
      setStatus('failed');
      setErrorMessage(event.message || event.error || 'Crawl failed unexpectedly');
    }
  }, [completeAndRedirect]);

  const fetchStatus = useCallback(async () => {
    const response = await fetch(`/api/crawl/status?agent_id=${agentId}`);
    if (!response.ok) return;
    const data = await response.json() as CrawlStatusPayload;
    applyStatusSnapshot(data);
  }, [agentId, applyStatusSnapshot]);

  // Fallback polling.
  const startPolling = useCallback(() => {
    if (pollingRef.current) return;
    pollingRef.current = setInterval(() => {
      void fetchStatus();
    }, 2000);
  }, [fetchStatus]);

  // SSE connection with initial hydration and fallback to polling.
  useEffect(() => {
    let mounted = true;
    const initialFetchTimer = setTimeout(() => {
      void fetchStatus();
    }, 0);

    const connectSSE = () => {
      try {
        const es = new EventSource(`/api/crawl/stream?agent_id=${agentId}`);
        eventSourceRef.current = es;

        es.onmessage = (e) => {
          if (!mounted) return;
          try {
            handleEvent(JSON.parse(e.data) as CrawlEvent);
          } catch {
            // Skip invalid messages.
          }
        };

        es.onerror = () => {
          if (!mounted) return;
          es.close();
          eventSourceRef.current = null;
          startPolling();
        };
      } catch {
        startPolling();
      }
    };

    connectSSE();

    return () => {
      mounted = false;
      clearTimeout(initialFetchTimer);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [agentId, fetchStatus, handleEvent, startPolling]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            {status === 'connecting' && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
            {status === 'crawling' && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
            {status === 'completed' && <CheckCircle2 className="h-5 w-5 text-green-500" />}
            {status === 'failed' && <AlertTriangle className="h-5 w-5 text-destructive" />}
            <span>
              {status === 'connecting' && t('crawl.connecting')}
              {status === 'crawling' && t('crawl.crawling')}
              {status === 'completed' && t('crawl.completed')}
              {status === 'failed' && t('crawl.failed')}
            </span>
          </CardTitle>
          {status === 'crawling' && pagesPerMinute > 0 && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <Zap className="h-3 w-3" />
              {pagesPerMinute} pg/min
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground font-medium">{progressValue}%</span>
            {status === 'crawling' && etaMinutes != null && etaMinutes > 0 && (
              <span className="flex items-center gap-1 text-muted-foreground text-xs">
                <Clock className="h-3.5 w-3.5" />
                {t('crawl.eta')}: ~{etaMinutes}m
              </span>
            )}
          </div>
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out ${
                status === 'completed'
                  ? 'bg-green-500'
                  : status === 'failed'
                    ? 'bg-destructive'
                    : 'bg-primary'
              }`}
              style={{ width: `${progressValue}%` }}
            >
              {status === 'crawling' && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_1.5s_infinite]" />
              )}
            </div>
          </div>
        </div>

        {status === 'crawling' && currentUrl && (
          <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            <span className="text-xs text-muted-foreground truncate">{currentUrl}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border bg-card p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Globe className="h-3.5 w-3.5" />
              {t('crawl.pagesFound')}
            </div>
            <div className="text-xl font-bold tabular-nums">{stats.crawled}</div>
            {effectiveDiscovered > 0 && (
              <div className="text-xs text-muted-foreground">of {effectiveDiscovered}</div>
            )}
          </div>
          <div className="rounded-lg border bg-card p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <FileText className="h-3.5 w-3.5" />
              {t('crawl.chunksCreated')}
            </div>
            <div className="text-xl font-bold tabular-nums">{stats.chunks}</div>
          </div>
          <div className="rounded-lg border bg-card p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5" />
              {t('crawl.errors')}
            </div>
            <div className={`text-xl font-bold tabular-nums ${stats.errors > 0 ? 'text-destructive' : ''}`}>
              {stats.errors}
            </div>
          </div>
          <div className="rounded-lg border bg-card p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {t('crawl.elapsed')}
            </div>
            <div className="text-xl font-bold tabular-nums">{formatElapsed()}</div>
          </div>
        </div>

        {events.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              {t('crawl.currentlyCrawling')}
            </div>
            <ScrollArea className="h-48 rounded-md border bg-muted/30 p-2">
              <div ref={scrollRef} className="space-y-1">
                {events.map((event, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 text-xs"
                  >
                    {event.type === 'error_page' ? (
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-destructive" />
                    ) : (
                      <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-green-500" />
                    )}
                    <div className="min-w-0 flex-1">
                      {event.title && (
                        <div className="truncate font-medium text-foreground">
                          {event.title}
                        </div>
                      )}
                      <div className="truncate text-muted-foreground">
                        {event.url}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {status === 'completed' && (
          <div className="flex items-center gap-2 rounded-md bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">
            <CheckCircle2 className="h-4 w-4" />
            {t('crawl.completed')}
          </div>
        )}

        {status === 'failed' && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {errorMessage || t('crawl.failed')}
          </div>
        )}

        {status === 'completed' && (
          <Button className="w-full" onClick={onComplete}>
            {t('crawl.viewAgent')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
