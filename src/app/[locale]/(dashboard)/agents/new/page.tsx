'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { CrawlProgress } from '@/components/agent/crawl-progress';
import { isValidUrl } from '@/lib/utils/url';
import { formatNumber } from '@/lib/utils/format';
import type { WorkspaceMode } from '@/types';

interface CrawlPreview {
  url: string;
  hostname: string;
  totalUrls: number;
  urls: string[];
  hasSitemap: boolean;
  crawlAllowed: boolean;
  likelySpa: boolean;
}

const steps = ['source', 'preflight', 'mode', 'launch'] as const;

export default function NewAgentPage() {
  const t = useTranslations('agents.newFlow');
  const router = useRouter();
  const [step, setStep] = useState<(typeof steps)[number]>('source');
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [maxDepth, setMaxDepth] = useState(5);
  const [maxPages, setMaxPages] = useState(500);
  const [includePaths, setIncludePaths] = useState('');
  const [excludePaths, setExcludePaths] = useState('');
  const [mode, setMode] = useState<WorkspaceMode>('hybrid');
  const [preview, setPreview] = useState<CrawlPreview | null>(null);
  const [error, setError] = useState('');
  const [agentId, setAgentId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const stepIndex = steps.indexOf(step);

  const runPreview = () => {
    const targetUrl = url.startsWith('http') ? url : `https://${url}`;
    if (!isValidUrl(targetUrl)) {
      setError(t('errors.invalidUrl'));
      return;
    }

    setError('');
    startTransition(() => {
      void (async () => {
        const response = await fetch('/api/crawl/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: targetUrl }),
        });
        const data = await response.json();

        if (!response.ok) {
          setError(data.error || t('errors.previewFailed'));
          return;
        }

        setPreview(data);
        if (!name) {
          setName(data.hostname);
        }
        setStep('preflight');
      })();
    });
  };

  const launchWorkflow = () => {
    const targetUrl = url.startsWith('http') ? url : `https://${url}`;

    setError('');
    startTransition(() => {
      void (async () => {
        const response = await fetch('/api/agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            root_url: targetUrl,
            name: name || undefined,
            description: description || undefined,
            max_depth: maxDepth,
            max_pages: maxPages,
            include_paths: includePaths
              ? includePaths.split(',').map((value) => value.trim()).filter(Boolean)
              : undefined,
            exclude_paths: excludePaths
              ? excludePaths.split(',').map((value) => value.trim()).filter(Boolean)
              : undefined,
            mode,
          }),
        });
        const data = await response.json();

        if (!response.ok || !data.agent?.id) {
          setError(data.error || t('errors.launchFailed'));
          return;
        }

        setAgentId(data.agent.id);
      })();
    });
  };

  if (agentId) {
    return (
      <div className="mx-auto max-w-4xl">
        <CrawlProgress
          agentId={agentId}
          onComplete={() => {
            if (mode === 'data') {
              router.push(`/data?agentId=${agentId}`);
              return;
            }

            router.push(`/agents/${agentId}`);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="surface-card rounded-[2rem] p-8 md:p-10">
        <span className="eyebrow">{t('eyebrow')}</span>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-muted-foreground">
          {t('subtitle')}
        </p>

        <div className="mt-8 grid gap-3 md:grid-cols-4">
          {steps.map((stepKey, index) => (
            <div
              key={stepKey}
              className={`rounded-[1.3rem] border px-4 py-3 text-sm font-medium ${
                index === stepIndex
                  ? 'border-primary bg-secondary text-secondary-foreground'
                  : 'border-border/70 bg-white/70 text-muted-foreground'
              }`}
            >
              {t(`steps.${stepKey}`)}
            </div>
          ))}
        </div>
      </section>

      {error ? (
        <div
          className="rounded-[1.4rem] border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          aria-live="polite"
        >
          {error}
        </div>
      ) : null}

      {step === 'source' ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('steps.source')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="url">{t('fields.url')}</Label>
              <Input
                id="url"
                name="url"
                placeholder="https://example.com"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">{t('fields.name')}</Label>
              <Input
                id="name"
                name="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">{t('fields.description')}</Label>
              <Input
                id="description"
                name="description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxDepth">{t('fields.maxDepth')}</Label>
              <Input
                id="maxDepth"
                name="maxDepth"
                type="number"
                min={1}
                max={10}
                value={maxDepth}
                onChange={(event) => setMaxDepth(Number(event.target.value) || 1)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxPages">{t('fields.maxPages')}</Label>
              <Input
                id="maxPages"
                name="maxPages"
                type="number"
                min={50}
                max={5000}
                step={50}
                value={maxPages}
                onChange={(event) => setMaxPages(Number(event.target.value) || 50)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="include">{t('fields.includePaths')}</Label>
              <Input
                id="include"
                name="includePaths"
                placeholder="/docs/*, /blog/*"
                value={includePaths}
                onChange={(event) => setIncludePaths(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="exclude">{t('fields.excludePaths')}</Label>
              <Input
                id="exclude"
                name="excludePaths"
                placeholder="/admin/*, /login"
                value={excludePaths}
                onChange={(event) => setExcludePaths(event.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <Button onClick={runPreview} disabled={isPending || !url.trim()}>
                {isPending ? t('actions.loading') : t('actions.preview')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 'preflight' && preview ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('steps.preflight')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              <Stat
                title={t('preflight.urls')}
                value={formatNumber(preview.totalUrls ?? preview.urls?.length ?? 0)}
              />
              <Stat title={t('preflight.hostname')} value={preview.hostname} />
              <Stat title={t('preflight.rendering')} value={preview.likelySpa ? 'SPA' : 'HTML'} />
              <Stat
                title={t('preflight.scope')}
                value={(preview.urls?.length ?? 0) > 0 ? t('preflight.liveLinks') : '0'}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={preview.hasSitemap ? 'success' : 'outline'}>
                {preview.hasSitemap ? t('preflight.sitemapFound') : t('preflight.noSitemap')}
              </Badge>
              <Badge variant={preview.crawlAllowed ? 'success' : 'destructive'}>
                {preview.crawlAllowed ? t('preflight.crawlAllowed') : t('preflight.crawlBlocked')}
              </Badge>
            </div>
            <div className="max-h-56 space-y-2 overflow-auto pr-1">
              {(preview.urls ?? []).slice(0, 10).map((entry) => (
                <div
                  key={entry}
                  className="rounded-2xl border border-border/70 px-3 py-2 text-xs text-muted-foreground"
                >
                  {entry}
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep('source')}>
                {t('actions.back')}
              </Button>
              <Button onClick={() => setStep('mode')}>{t('actions.next')}</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 'mode' ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('steps.mode')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            {(['agent', 'data', 'hybrid'] as WorkspaceMode[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setMode(option)}
                className={`rounded-[1.5rem] border p-5 text-left transition-colors ${
                  mode === option
                    ? 'border-primary bg-secondary text-secondary-foreground'
                    : 'border-border/70 bg-white/70 text-foreground hover:bg-white'
                }`}
              >
                <p className="text-lg font-semibold">{t(`modes.${option}.title`)}</p>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {t(`modes.${option}.description`)}
                </p>
              </button>
            ))}
            <div className="md:col-span-3 flex gap-3">
              <Button variant="outline" onClick={() => setStep('preflight')}>
                {t('actions.back')}
              </Button>
              <Button onClick={() => setStep('launch')}>{t('actions.next')}</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 'launch' ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('steps.launch')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Summary label={t('fields.url')} value={url} />
              <Summary label={t('fields.name')} value={name || preview?.hostname || 'Agent'} />
              <Summary label={t('fields.maxDepth')} value={String(maxDepth)} />
              <Summary label={t('fields.maxPages')} value={formatNumber(maxPages)} />
              <Summary label={t('fields.mode')} value={t(`modes.${mode}.title`)} />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep('mode')}>
                {t('actions.back')}
              </Button>
              <Button onClick={launchWorkflow} disabled={isPending}>
                {isPending ? t('actions.loading') : t('actions.launch')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Stat({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-[1.3rem] border border-border/70 bg-white/72 p-4">
      <p className="text-sm text-muted-foreground">{title}</p>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.3rem] border border-border/70 bg-white/72 p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="mt-2 text-sm font-medium leading-6">{value}</div>
    </div>
  );
}
