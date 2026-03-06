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
  total_discovered?: number;
  chunks_created?: number;
  total_pages?: number;
  total_chunks?: number;
  message?: string;
  error?: string;
}

interface CrawlProgressProps {
  agentId: string;
  onComplete: () => void;
}

export function CrawlProgress({ agentId, onComplete }: CrawlProgressProps) {
  const t = useTranslations('agents');
  const [events, setEvents] = useState<CrawlEvent[]>([]);
  const [stats, setStats] = useState({ crawled: 0, discovered: 0, chunks: 0, errors: 0 });
  const [status, setStatus] = useState<'connecting' | 'crawling' | 'completed' | 'failed'>('connecting');
  const [errorMessage, setErrorMessage] = useState('');
  const [startTime] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [currentUrl, setCurrentUrl] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const completedRef = useRef(false);
  const pagesPerMinuteRef = useRef(0);

  // Tick every second for elapsed time / ETA display
  useEffect(() => {
    timerRef.current = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Calculate ETA
  const elapsed = now - startTime;
  const progress = stats.discovered > 0 ? (stats.crawled / stats.discovered) * 100 : 0;
  const etaMs = progress > 5 ? (elapsed / progress) * (100 - progress) : 0;
  const etaMinutes = Math.ceil(etaMs / 60000);
  const elapsedMinutes = Math.floor(elapsed / 60000);
  const elapsedSeconds = Math.floor((elapsed % 60000) / 1000);

  // Pages per minute calculation — update every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const elapsedMins = (Date.now() - startTime) / 60000;
      if (elapsedMins > 0) {
        pagesPerMinuteRef.current = Math.round(stats.crawled / elapsedMins);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [startTime, stats.crawled]);

  const formatElapsed = useCallback(() => {
    if (elapsedMinutes > 0) {
      return `${elapsedMinutes}m ${elapsedSeconds}s`;
    }
    return `${elapsedSeconds}s`;
  }, [elapsedMinutes, elapsedSeconds]);

  // Auto-scroll the log
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  const handleEvent = useCallback((event: CrawlEvent) => {
    if (event.type === 'heartbeat' || event.type === 'connected') {
      if (event.type === 'connected') {
        setStatus('crawling');
      }
      return;
    }

    if (event.type === 'page_crawled' || event.type === 'progress') {
      setStatus('crawling');
      setStats((prev) => ({
        crawled: event.crawled_count ?? prev.crawled,
        discovered: event.total_discovered ?? prev.discovered,
        chunks: event.chunks_created ?? prev.chunks,
        errors: prev.errors,
      }));
      if (event.url) {
        setCurrentUrl(event.url);
        setEvents((prev) => {
          const next = [...prev, event];
          // Keep at most 100 visible entries
          return next.length > 100 ? next.slice(-100) : next;
        });
      }
    }

    if (event.type === 'error_page') {
      setStats((prev) => ({ ...prev, errors: prev.errors + 1 }));
      if (event.url) {
        setEvents((prev) => {
          const next = [...prev, event];
          return next.length > 100 ? next.slice(-100) : next;
        });
      }
    }

    if (event.type === 'completed') {
      setStatus('completed');
      setStats((prev) => ({
        crawled: event.total_pages ?? prev.crawled,
        discovered: event.total_pages ?? prev.discovered,
        chunks: event.total_chunks ?? prev.chunks,
        errors: prev.errors,
      }));
      if (!completedRef.current) {
        completedRef.current = true;
        setTimeout(() => onComplete(), 2000);
      }
    }

    if (event.type === 'failed') {
      setStatus('failed');
      setErrorMessage(event.message || event.error || 'Crawl failed unexpectedly');
    }
  }, [onComplete]);

  // Fallback polling
  const startPolling = useCallback(() => {
    if (pollingRef.current) return;
    pollingRef.current = setInterval(async () => {
      try {
        const response = await fetch(`/api/crawl/status?agent_id=${agentId}`);
        if (!response.ok) return;
        const data = await response.json();

        setStats((prev) => ({
          crawled: data.crawl_stats?.crawled_pages ?? prev.crawled,
          discovered: data.crawl_stats?.total_pages ?? prev.discovered,
          chunks: data.crawl_stats?.total_chunks ?? prev.chunks,
          errors: data.crawl_stats?.errors ?? prev.errors,
        }));

        if (data.status === 'crawling' || data.status === 'processing') {
          setStatus('crawling');
        }

        if (data.status === 'ready') {
          setStatus('completed');
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          if (!completedRef.current) {
            completedRef.current = true;
            setTimeout(() => onComplete(), 2000);
          }
        }

        if (data.status === 'error') {
          setStatus('failed');
          setErrorMessage(data.crawl_stats?.error_message || 'Crawl failed');
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      } catch {
        // Ignore polling errors
      }
    }, 2000);
  }, [agentId, onComplete]);

  // SSE connection with fallback to polling
  useEffect(() => {
    let mounted = true;

    const connectSSE = () => {
      try {
        const es = new EventSource(`/api/crawl/stream?agent_id=${agentId}`);
        eventSourceRef.current = es;

        es.onmessage = (e) => {
          if (!mounted) return;
          try {
            const data: CrawlEvent = JSON.parse(e.data);
            handleEvent(data);
          } catch {
            // Skip invalid messages
          }
        };

        es.onerror = () => {
          if (!mounted) return;
          // Close the failed EventSource
          es.close();
          eventSourceRef.current = null;
          // Fall back to polling
          startPolling();
        };
      } catch {
        // If EventSource construction fails, fall back to polling
        startPolling();
      }
    };

    connectSSE();

    return () => {
      mounted = false;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [agentId, handleEvent, startPolling]);

  const progressValue =
    status === 'completed'
      ? 100
      : status === 'connecting'
        ? 5
        : stats.discovered > 0
          ? Math.min(Math.round((stats.crawled / stats.discovered) * 100), 95)
          : 10;

  // Pages per minute — live calculation
  const elapsedMins = elapsed / 60000;
  const pagesPerMinute = elapsedMins > 0.1 ? Math.round(stats.crawled / elapsedMins) : 0;

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
        {/* Modern animated progress bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground font-medium">{progressValue}%</span>
            {status === 'crawling' && etaMs > 0 && (
              <span className="flex items-center gap-1 text-muted-foreground text-xs">
                <Clock className="h-3.5 w-3.5" />
                {t('crawl.eta')}: ~{etaMinutes} {etaMinutes === 1 ? 'min' : 'mins'}
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

        {/* Live current URL */}
        {status === 'crawling' && currentUrl && (
          <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            <span className="text-xs text-muted-foreground truncate">{currentUrl}</span>
          </div>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border bg-card p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Globe className="h-3.5 w-3.5" />
              {t('crawl.pagesFound')}
            </div>
            <div className="text-xl font-bold tabular-nums">{stats.crawled}</div>
            {stats.discovered > 0 && (
              <div className="text-xs text-muted-foreground">of {stats.discovered}</div>
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

        {/* Live log */}
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

        {/* Completed state */}
        {status === 'completed' && (
          <div className="flex items-center gap-2 rounded-md bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">
            <CheckCircle2 className="h-4 w-4" />
            {t('crawl.completed')}
          </div>
        )}

        {/* Failed state */}
        {status === 'failed' && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {errorMessage || t('crawl.failed')}
          </div>
        )}

        {/* View Agent button on complete */}
        {status === 'completed' && (
          <Button className="w-full" onClick={onComplete}>
            {t('crawl.viewAgent')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
