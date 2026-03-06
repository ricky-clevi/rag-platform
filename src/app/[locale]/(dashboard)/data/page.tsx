'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/client';
import { formatNumber } from '@/lib/utils/format';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Database, Radar, Search, Sparkles } from 'lucide-react';
import type { Agent } from '@/types';

interface MapResult {
  url: string;
  hostname: string;
  totalUrls: number;
  urls: string[];
  hasSitemap: boolean;
  crawlAllowed: boolean;
  likelySpa: boolean;
}

interface SearchResult {
  page_url: string;
  content: string;
  heading_path?: string;
  similarity: number;
}

interface ExtractResult {
  answer: string;
  sources: string[];
}

interface CrawlLaunchResult {
  crawlJobId: string;
}

export default function DataPage() {
  const t = useTranslations('data');
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [mapUrl, setMapUrl] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [extractPrompt, setExtractPrompt] = useState('');
  const [mapResult, setMapResult] = useState<MapResult | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [extractResult, setExtractResult] = useState<ExtractResult | null>(null);
  const [crawlLaunch, setCrawlLaunch] = useState<CrawlLaunchResult | null>(null);
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;

    async function fetchAgents() {
      const { data } = await supabase
        .from('agents')
        .select('*')
        .order('created_at', { ascending: false });

      if (!active) return;

      const nextAgents = (data as Agent[]) || [];
      const focusedId = searchParams.get('agentId');

      setAgents(nextAgents);
      if (focusedId && nextAgents.some((agent) => agent.id === focusedId)) {
        setSelectedAgentId(focusedId);
      } else if (nextAgents[0]) {
        setSelectedAgentId(nextAgents[0].id);
      }
    }

    fetchAgents();

    return () => {
      active = false;
    };
  }, [searchParams, supabase]);

  const runAction = (task: () => Promise<void>) => {
    setError('');
    startTransition(() => {
      void task().catch(() => {
        setError(t('errors.requestFailed'));
      });
    });
  };

  const handleMap = () =>
    runAction(async () => {
      const response = await fetch('/api/data/map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: mapUrl.trim() }),
      });
      const data = await response.json();

      if (!response.ok) {
        setMapResult(null);
        setError(data.error || t('errors.mapFailed'));
        return;
      }

      setMapResult(data);
    });

  const handleLaunchCrawl = () =>
    runAction(async () => {
      const response = await fetch('/api/data/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: selectedAgentId }),
      });
      const data = await response.json();

      if (!response.ok) {
        setCrawlLaunch(null);
        setError(data.error || t('errors.launchFailed'));
        return;
      }

      setCrawlLaunch(data);
    });

  const handleSearch = () =>
    runAction(async () => {
      const response = await fetch('/api/data/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: selectedAgentId, query: searchQuery.trim() }),
      });
      const data = await response.json();

      if (!response.ok) {
        setSearchResults([]);
        setError(data.error || t('errors.searchFailed'));
        return;
      }

      setSearchResults(data.results || []);
    });

  const handleExtract = () =>
    runAction(async () => {
      const response = await fetch('/api/data/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: selectedAgentId, prompt: extractPrompt.trim() }),
      });
      const data = await response.json();

      if (!response.ok) {
        setExtractResult(null);
        setError(data.error || t('errors.extractFailed'));
        return;
      }

      setExtractResult(data);
    });

  return (
    <div className="space-y-6">
      <section className="surface-card rounded-[2rem] p-8 md:p-10">
        <span className="eyebrow">{t('eyebrow')}</span>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-muted-foreground">
          {t('subtitle')}
        </p>
      </section>

      {error ? (
        <div className="rounded-[1.4rem] border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <Radar className="h-5 w-5 text-primary" />
              {t('map.title')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm leading-6 text-muted-foreground">{t('map.description')}</p>
            <div className="space-y-2">
              <Label htmlFor="map-url">{t('fields.url')}</Label>
              <Input
                id="map-url"
                name="map-url"
                placeholder="https://example.com"
                value={mapUrl}
                onChange={(event) => setMapUrl(event.target.value)}
              />
            </div>
            <Button
              onClick={handleMap}
              disabled={isPending || !mapUrl.trim()}
              className="w-full"
            >
              {isPending ? t('actions.loading') : t('actions.map')}
            </Button>

            {mapResult ? (
              <div className="space-y-4 rounded-[1.4rem] border border-border/70 bg-white/72 p-4">
                <div className="flex flex-wrap gap-2">
                  <Badge variant={mapResult.hasSitemap ? 'success' : 'outline'}>
                    {mapResult.hasSitemap ? t('map.sitemapFound') : t('map.noSitemap')}
                  </Badge>
                  <Badge variant={mapResult.crawlAllowed ? 'success' : 'destructive'}>
                    {mapResult.crawlAllowed ? t('map.crawlAllowed') : t('map.crawlBlocked')}
                  </Badge>
                  {mapResult.likelySpa ? <Badge variant="secondary">SPA</Badge> : null}
                </div>
                <div>
                  <p className="text-base font-semibold">{mapResult.hostname}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t('map.discoveryCount', {
                      count: formatNumber(mapResult.totalUrls),
                    })}
                  </p>
                </div>
                <div className="max-h-56 space-y-2 overflow-auto pr-1">
                  {mapResult.urls.slice(0, 12).map((url) => (
                    <div
                      key={url}
                      className="rounded-2xl border border-border/70 px-3 py-2 text-xs text-muted-foreground"
                    >
                      {url}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <Database className="h-5 w-5 text-primary" />
              {t('crawl.title')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm leading-6 text-muted-foreground">{t('crawl.description')}</p>
            <AgentSelect
              agents={agents}
              selectedAgentId={selectedAgentId}
              onChange={setSelectedAgentId}
              label={t('fields.agent')}
              id="crawl-agent"
            />
            <Button
              onClick={handleLaunchCrawl}
              disabled={isPending || !selectedAgentId}
              className="w-full"
            >
              {isPending ? t('actions.loading') : t('actions.launchCrawl')}
            </Button>

            {crawlLaunch ? (
              <div className="rounded-[1.4rem] border border-border/70 bg-white/72 p-4">
                <p className="text-sm font-semibold">{t('crawl.launchedTitle')}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {t('crawl.launchedCopy')}
                </p>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <Button variant="outline" asChild>
                    <Link href={`/monitor?agentId=${selectedAgentId}`}>
                      {t('crawl.openWorkspace')}
                    </Link>
                  </Button>
                  <Button variant="ghost" asChild>
                    <Link href={`/data?jobId=${crawlLaunch.crawlJobId}`}>
                      {t('crawl.openData')}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <Search className="h-5 w-5 text-primary" />
              {t('search.title')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <AgentSelect
              agents={agents}
              selectedAgentId={selectedAgentId}
              onChange={setSelectedAgentId}
              label={t('fields.agent')}
              id="search-agent"
            />
            <div className="space-y-2">
              <Label htmlFor="search-query">{t('fields.query')}</Label>
              <Input
                id="search-query"
                name="search-query"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>
            <Button
              onClick={handleSearch}
              disabled={isPending || !selectedAgentId || !searchQuery.trim()}
              className="w-full"
            >
              {isPending ? t('actions.loading') : t('actions.search')}
            </Button>

            <div className="space-y-3">
              {searchResults.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('search.empty')}</p>
              ) : (
                searchResults.slice(0, 6).map((result) => (
                  <div
                    key={`${result.page_url}-${result.heading_path || result.content.slice(0, 24)}`}
                    className="rounded-[1.3rem] border border-border/70 bg-white/72 p-4"
                  >
                    <p className="text-xs font-semibold text-primary">
                      {t('search.match', {
                        score: Math.round(result.similarity * 100),
                      })}
                    </p>
                    <p className="mt-2 text-sm font-medium">
                      {result.heading_path || result.page_url}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {result.content.slice(0, 180)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-primary" />
              {t('extract.title')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <AgentSelect
              agents={agents}
              selectedAgentId={selectedAgentId}
              onChange={setSelectedAgentId}
              label={t('fields.agent')}
              id="extract-agent"
            />
            <div className="space-y-2">
              <Label htmlFor="extract-prompt">{t('fields.prompt')}</Label>
              <textarea
                id="extract-prompt"
                value={extractPrompt}
                onChange={(event) => setExtractPrompt(event.target.value)}
                className="min-h-40 w-full rounded-[1.5rem] border border-input bg-white/72 px-4 py-3 text-sm outline-none transition-[border-color,box-shadow] focus:border-primary/40 focus:ring-4 focus:ring-primary/10"
              />
            </div>
            <Button
              onClick={handleExtract}
              disabled={isPending || !selectedAgentId || !extractPrompt.trim()}
              className="w-full"
            >
              {isPending ? t('actions.loading') : t('actions.extract')}
            </Button>

            {extractResult ? (
              <div className="space-y-4 rounded-[1.4rem] border border-border/70 bg-white/72 p-4">
                <p className="text-sm leading-7 text-foreground">
                  {extractResult.answer || t('extract.noSummary')}
                </p>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {t('extract.sources')}
                  </p>
                  {extractResult.sources.map((source) => (
                    <div key={source} className="text-xs text-muted-foreground">
                      {source}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AgentSelect({
  agents,
  selectedAgentId,
  onChange,
  label,
  id,
}: {
  agents: Agent[];
  selectedAgentId: string;
  onChange: (value: string) => void;
  label: string;
  id: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={selectedAgentId}
        onChange={(event) => onChange(event.target.value)}
        className="flex h-11 w-full rounded-2xl border border-input bg-white/72 px-4 text-sm outline-none transition-[border-color,box-shadow] focus:border-primary/40 focus:ring-4 focus:ring-primary/10"
      >
        {agents.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.name}
          </option>
        ))}
      </select>
    </div>
  );
}
