'use client';

import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FullPageLoader, Spinner } from '@/components/common/loading-states';
import { AgentStatusBadge } from '@/components/agent/agent-status';
import { formatDate, formatNumber } from '@/lib/utils/format';
import {
  Activity,
  Bot,
  Copy,
  ExternalLink,
  Gauge,
  Globe,
  Link2,
  Radar,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { Agent, AgentSettings, ShareLink } from '@/types';
import { WidgetEmbedSection } from '@/components/widget-embed-section';

interface AgentStats {
  pages: number;
  chunks: number;
}

interface AgentDomainEntry {
  id: string;
  domain: string;
  is_primary: boolean;
}

interface RecrawlPolicy {
  enabled: boolean;
  frequency_hours: number;
  next_run_at: string | null;
}

interface AnalyticsSummary {
  summary: {
    total_conversations: number;
    total_messages: number;
    avg_confidence: number;
    low_confidence_count: number;
  };
}

export default function AgentDetailPage() {
  const params = useParams<{ id: string }>();
  const t = useTranslations('agents.console');
  const crawlOptionsT = useTranslations('agents.console.monitoring.crawlOptions');
  const agentId = params.id;
  const [loading, setLoading] = useState(true);
  const [busy, startTransition] = useTransition();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [settings, setSettings] = useState<AgentSettings | null>(null);
  const [stats, setStats] = useState<AgentStats>({ pages: 0, chunks: 0 });
  const [domains, setDomains] = useState<AgentDomainEntry[]>([]);
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [policy, setPolicy] = useState<RecrawlPolicy | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [customDomain, setCustomDomain] = useState('');
  const [customDomainVerified, setCustomDomainVerified] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private' | 'passcode'>('public');
  const [passcode, setPasscode] = useState('');
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [stealthMode, setStealthMode] = useState(false);
  const [proxyUrl, setProxyUrl] = useState('');
  const [enableOcr, setEnableOcr] = useState(false);
  const [maxImagesOcr, setMaxImagesOcr] = useState('3');
  const [enableTableDescriptions, setEnableTableDescriptions] = useState(false);
  const [enableYoutubeTranscripts, setEnableYoutubeTranscripts] = useState(false);
  const [recrawlEnabled, setRecrawlEnabled] = useState(false);
  const [recrawlFrequency, setRecrawlFrequency] = useState('168');
  const [newDomain, setNewDomain] = useState('');
  const [shareLabel, setShareLabel] = useState('');
  const [message, setMessage] = useState('');

  const shareUrl = useMemo(() => {
    if (!agent || typeof window === 'undefined') return '';
    return `${window.location.origin}/agent/${agent.slug}`;
  }, [agent]);

  const loadConsole = useCallback(async () => {
    const [
      agentResponse,
      domainsResponse,
      shareLinksResponse,
      policyResponse,
      customDomainResponse,
      analyticsResponse,
    ] = await Promise.all([
      fetch(`/api/agents/${agentId}`),
      fetch(`/api/agents/${agentId}/domains`),
      fetch(`/api/agents/${agentId}/share-links`),
      fetch(`/api/agents/${agentId}/recrawl-policy`),
      fetch(`/api/agents/${agentId}/custom-domain`),
      fetch(`/api/agents/${agentId}/analytics?days=30`),
    ]);

    const agentPayload = await agentResponse.json();
    const domainsPayload = await domainsResponse.json();
    const shareLinksPayload = await shareLinksResponse.json();
    const policyPayload = await policyResponse.json();
    const customDomainPayload = await customDomainResponse.json();
    const analyticsPayload = await analyticsResponse.json();

    if (!agentResponse.ok) {
      setLoading(false);
      return;
    }

    setAgent(agentPayload.agent);
    setSettings(agentPayload.settings);
    setStats(agentPayload.stats);
    setDomains(domainsPayload.domains || []);
    setShareLinks(shareLinksPayload.share_links || []);
    setPolicy(policyPayload.policy || null);
    setAnalytics(analyticsResponse.ok ? analyticsPayload : null);
    setCustomDomain(customDomainPayload.custom_domain || '');
    setCustomDomainVerified(Boolean(customDomainPayload.verified));
    setName(agentPayload.agent.name || '');
    setDescription(agentPayload.agent.description || '');
    setVisibility(agentPayload.agent.visibility || 'public');
    setWelcomeMessage(agentPayload.settings?.welcome_message || '');
    setStealthMode(Boolean(agentPayload.settings?.crawl_options?.stealth_mode));
    setProxyUrl(agentPayload.settings?.crawl_options?.proxy_url || '');
    setEnableOcr(Boolean(agentPayload.settings?.crawl_options?.enable_ocr));
    setMaxImagesOcr(String(agentPayload.settings?.crawl_options?.max_images_ocr || 3));
    setEnableTableDescriptions(Boolean(agentPayload.settings?.crawl_options?.enable_table_descriptions));
    setEnableYoutubeTranscripts(Boolean(agentPayload.settings?.crawl_options?.enable_youtube_transcripts));
    setRecrawlEnabled(Boolean(policyPayload.policy?.enabled));
    setRecrawlFrequency(String(policyPayload.policy?.frequency_hours || 168));
    setLoading(false);
  }, [agentId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadConsole();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadConsole]);

  const setFeedback = (value: string) => {
    setMessage(value);
    window.setTimeout(() => {
      setMessage((current) => (current === value ? '' : current));
    }, 2500);
  };

  const runTask = (task: () => Promise<void>) => {
    startTransition(() => {
      void task().catch(() => {
        setFeedback(t('errors.generic'));
      });
    });
  };

  const saveSettings = () =>
    runTask(async () => {
      const response = await fetch(`/api/agents/${agentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          visibility,
          passcode: visibility === 'passcode' ? passcode : undefined,
          settings: {
            welcome_message: welcomeMessage,
            crawl_options: {
              stealth_mode: stealthMode,
              proxy_url: proxyUrl || null,
              enable_ocr: enableOcr,
              max_images_ocr: Number(maxImagesOcr) || 3,
              enable_table_descriptions: enableTableDescriptions,
              enable_youtube_transcripts: enableYoutubeTranscripts,
            },
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setFeedback(payload.error || t('errors.generic'));
        return;
      }

      setAgent(payload.agent);
      setSettings(payload.settings);
      setPasscode('');
      setFeedback(t('messages.saved'));
    });

  const generateStarters = () =>
    runTask(async () => {
      const response = await fetch(`/api/agents/${agentId}/generate-starters`, {
        method: 'POST',
      });
      const payload = await response.json();
      if (!response.ok) {
        setFeedback(payload.error || t('errors.generic'));
        return;
      }

      setSettings((current) =>
        current
          ? { ...current, starter_questions: payload.starter_questions || [] }
          : current
      );
      setFeedback(t('messages.startersGenerated'));
    });

  const saveRecrawlPolicy = () =>
    runTask(async () => {
      const response = await fetch(`/api/agents/${agentId}/recrawl-policy`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: recrawlEnabled,
          frequency_hours: Number(recrawlFrequency) || 168,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setFeedback(payload.error || t('errors.generic'));
        return;
      }

      setPolicy(payload.policy);
      setFeedback(t('messages.policySaved'));
    });

  const addDomain = () =>
    runTask(async () => {
      const response = await fetch(`/api/agents/${agentId}/domains`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: newDomain, is_primary: domains.length === 0 }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setFeedback(payload.error || t('errors.generic'));
        return;
      }

      setDomains((current) => [payload.domain, ...current]);
      setNewDomain('');
      setFeedback(t('messages.domainAdded'));
    });

  const saveCustomDomain = () =>
    runTask(async () => {
      const response = await fetch(`/api/agents/${agentId}/custom-domain`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ custom_domain: customDomain }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setFeedback(payload.error || t('errors.generic'));
        return;
      }

      setCustomDomain(payload.custom_domain || '');
      setCustomDomainVerified(Boolean(payload.verified));
      setFeedback(t('messages.customDomainSaved'));
    });

  const createShareLink = () =>
    runTask(async () => {
      const response = await fetch(`/api/agents/${agentId}/share-links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: shareLabel || null }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setFeedback(payload.error || t('errors.generic'));
        return;
      }

      setShareLinks((current) => [payload.share_link, ...current]);
      setShareLabel('');
      setFeedback(t('messages.shareCreated'));
    });

  const triggerRecrawl = () =>
    runTask(async () => {
      const response = await fetch('/api/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: agentId,
          job_type: 'incremental',
          ignore_robots: true,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFeedback(payload.error || t('errors.generic'));
        return;
      }

      setFeedback(t('messages.recrawlQueued'));
      setLoading(true);
      await loadConsole();
    });

  const copyValue = async (value: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback(successMessage);
    } catch {
      setFeedback(t('errors.copy'));
    }
  };

  if (loading) {
    return <FullPageLoader />;
  }

  if (!agent) {
    return <div className="text-sm text-muted-foreground">{t('errors.notFound')}</div>;
  }

  return (
    <div className="space-y-6">
      <section className="surface-card rounded-[2rem] p-8 md:p-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="eyebrow">{t('eyebrow')}</span>
              <AgentStatusBadge status={agent.status} />
            </div>
            <div>
              <h1 className="text-4xl font-semibold tracking-tight">{agent.name}</h1>
              <a
                href={agent.root_url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <Globe className="h-4 w-4" />
                {agent.root_url}
              </a>
            </div>
            <p className="max-w-3xl text-base leading-7 text-muted-foreground">
              {agent.description || t('fallbackDescription')}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
            {agent.status === 'ready' ? (
              <Button asChild>
                <Link href={`/agent/${agent.slug}`}>
                  <ExternalLink className="h-4 w-4" />
                  {t('actions.openPublic')}
                </Link>
              </Button>
            ) : null}
            <Button variant="outline" onClick={triggerRecrawl} disabled={busy}>
              {busy ? <Spinner /> : <RefreshCw className="h-4 w-4" />}
              {t('actions.recrawl')}
            </Button>
          </div>
        </div>

        {message ? (
          <div className="mt-6 rounded-[1.3rem] border border-border/70 bg-surface-glass px-4 py-3 text-sm text-foreground">
            {message}
          </div>
        ) : null}
      </section>

      <div className="metric-grid">
        <ConsoleMetric label={t('stats.pages')} value={formatNumber(stats.pages)} icon={Search} />
        <ConsoleMetric label={t('stats.chunks')} value={formatNumber(stats.chunks)} icon={Bot} />
        <ConsoleMetric
          label={t('stats.conversations')}
          value={formatNumber(analytics?.summary.total_conversations || 0)}
          icon={Activity}
        />
        <ConsoleMetric
          label={t('stats.confidence')}
          value={`${Math.round((analytics?.summary.avg_confidence || 0) * 100)}%`}
          icon={Gauge}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <ConsoleCard
          icon={Search}
          title={t('knowledge.title')}
          body={t('knowledge.copy')}
          footer={
            <div className="flex gap-3">
              <Button variant="outline" asChild>
                <Link href={`/agents/${agentId}/knowledge`}>{t('knowledge.open')}</Link>
              </Button>
              <Button variant="ghost" asChild>
                <Link href={`/agents/${agentId}/diff`}>{t('knowledge.diff')}</Link>
              </Button>
            </div>
          }
        >
          <dl className="grid gap-3 sm:grid-cols-2">
            <DataLine label={t('knowledge.pages')} value={formatNumber(stats.pages)} />
            <DataLine label={t('knowledge.chunks')} value={formatNumber(stats.chunks)} />
            <DataLine
              label={t('knowledge.lastCrawl')}
              value={
                agent.crawl_stats?.completed_at
                  ? formatDate(agent.crawl_stats.completed_at)
                  : '-'
              }
            />
            <DataLine
              label={t('knowledge.failed')}
              value={formatNumber(agent.crawl_stats?.errors || 0)}
            />
          </dl>
        </ConsoleCard>

        <ConsoleCard
          icon={Link2}
          title={t('publish.title')}
          body={t('publish.copy')}
          footer={
            <div className="flex flex-wrap gap-3">
              <Button onClick={saveSettings} disabled={busy}>
                {busy ? <Spinner /> : null}
                {t('publish.save')}
              </Button>
              {shareUrl ? (
                <Button
                  variant="outline"
                  onClick={() => copyValue(shareUrl, t('messages.linkCopied'))}
                >
                  <Copy className="h-4 w-4" />
                  {t('publish.copyLink')}
                </Button>
              ) : null}
            </div>
          }
        >
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={t('publish.name')}>
                <Input value={name} onChange={(event) => setName(event.target.value)} />
              </Field>
              <Field label={t('publish.visibility')}>
                <select
                  value={visibility}
                  onChange={(event) =>
                    setVisibility(event.target.value as 'public' | 'private' | 'passcode')
                  }
                  className="flex h-11 w-full rounded-2xl border border-input bg-surface-glass px-4 text-sm outline-none transition-[border-color,box-shadow] focus:border-primary/40 focus:ring-4 focus:ring-primary/10"
                >
                  <option value="public">{t('publish.visibilityOptions.public')}</option>
                  <option value="private">{t('publish.visibilityOptions.private')}</option>
                  <option value="passcode">{t('publish.visibilityOptions.passcode')}</option>
                </select>
              </Field>
            </div>
            <Field label={t('publish.description')}>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="min-h-28 w-full rounded-[1.5rem] border border-input bg-surface-glass px-4 py-3 text-sm outline-none transition-[border-color,box-shadow] focus:border-primary/40 focus:ring-4 focus:ring-primary/10"
              />
            </Field>
            {visibility === 'passcode' ? (
              <Field label={t('publish.passcode')}>
                <Input
                  type="password"
                  value={passcode}
                  onChange={(event) => setPasscode(event.target.value)}
                  placeholder={t('publish.passcodePlaceholder')}
                />
              </Field>
            ) : null}
            <div className="rounded-[1.3rem] border border-border/70 bg-surface-glass p-4 text-sm text-muted-foreground">
              {shareUrl}
            </div>
          </div>
        </ConsoleCard>

        <ConsoleCard
          icon={ShieldCheck}
          title={t('guardrails.title')}
          body={t('guardrails.copy')}
          footer={
            <div className="flex gap-3">
              <Button onClick={saveSettings} disabled={busy}>
                {t('guardrails.save')}
              </Button>
              <Button variant="outline" onClick={generateStarters} disabled={busy}>
                {t('guardrails.generate')}
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <Field label={t('guardrails.welcomeMessage')}>
              <textarea
                value={welcomeMessage}
                onChange={(event) => setWelcomeMessage(event.target.value)}
                className="min-h-28 w-full rounded-[1.5rem] border border-input bg-surface-glass px-4 py-3 text-sm outline-none transition-[border-color,box-shadow] focus:border-primary/40 focus:ring-4 focus:ring-primary/10"
              />
            </Field>
            <div className="space-y-2">
              <Label>{t('guardrails.starters')}</Label>
              <div className="flex flex-wrap gap-2">
                {settings?.starter_questions?.length ? (
                  settings.starter_questions.map((question) => (
                    <Badge key={question} variant="outline" className="bg-surface-glass-strong">
                      {question}
                    </Badge>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">{t('guardrails.empty')}</p>
                )}
              </div>
            </div>
          </div>
        </ConsoleCard>

        <ConsoleCard
          icon={Globe}
          title={t('domains.title')}
          body={t('domains.copy')}
          footer={
            <div className="flex gap-3">
              <Button onClick={addDomain} disabled={busy || !newDomain.trim()}>
                {t('domains.add')}
              </Button>
              <Button onClick={saveCustomDomain} variant="outline" disabled={busy || !customDomain.trim()}>
                {t('domains.saveCustom')}
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <Field label={t('domains.custom')}>
              <Input
                value={customDomain}
                onChange={(event) => setCustomDomain(event.target.value)}
                placeholder="chat.example.com"
              />
            </Field>
            <Badge variant={customDomainVerified ? 'success' : 'outline'}>
              {customDomainVerified ? t('domains.verified') : t('domains.pending')}
            </Badge>
            <Field label={t('domains.additional')}>
              <Input
                value={newDomain}
                onChange={(event) => setNewDomain(event.target.value)}
                placeholder="docs.example.com"
              />
            </Field>
            <div className="space-y-2">
              {domains.length ? (
                domains.map((domain) => (
                  <div
                    key={domain.id}
                    className="flex items-center justify-between rounded-[1.2rem] border border-border/70 bg-surface-glass px-4 py-3 text-sm"
                  >
                    <span>{domain.domain}</span>
                    {domain.is_primary ? (
                      <Badge variant="success">{t('domains.primary')}</Badge>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">{t('domains.empty')}</p>
              )}
            </div>
          </div>
        </ConsoleCard>

        <ConsoleCard
          icon={Radar}
          title={t('monitoring.title')}
          body={t('monitoring.copy')}
          footer={
            <div className="flex gap-3">
              <Button onClick={saveRecrawlPolicy} disabled={busy}>
                {t('monitoring.save')}
              </Button>
              <Button variant="outline" asChild>
                <Link href={`/monitor?agentId=${agentId}`}>{t('monitoring.open')}</Link>
              </Button>
            </div>
          }
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t('monitoring.status')}>
              <Badge variant={recrawlEnabled ? 'success' : 'outline'}>
                {recrawlEnabled ? t('monitoring.enabled') : t('monitoring.disabled')}
              </Badge>
            </Field>
            <Field label={t('monitoring.frequency')}>
              <select
                value={recrawlFrequency}
                onChange={(event) => setRecrawlFrequency(event.target.value)}
                className="flex h-11 w-full rounded-2xl border border-input bg-surface-glass px-4 text-sm outline-none transition-[border-color,box-shadow] focus:border-primary/40 focus:ring-4 focus:ring-primary/10"
              >
                <option value="24">24h</option>
                <option value="72">72h</option>
                <option value="168">168h</option>
                <option value="336">336h</option>
              </select>
            </Field>
            <Field label={t('monitoring.nextRun')}>
              <div className="rounded-[1.2rem] border border-border/70 bg-surface-glass px-4 py-3 text-sm text-muted-foreground">
                {policy?.next_run_at ? formatDate(policy.next_run_at) : t('monitoring.noNextRun')}
              </div>
            </Field>
            <Field label={t('monitoring.failures')}>
              <div className="rounded-[1.2rem] border border-border/70 bg-surface-glass px-4 py-3 text-sm text-muted-foreground">
                {formatNumber(agent.crawl_stats?.errors || 0)}
              </div>
            </Field>
            <Field label={crawlOptionsT('stealthMode')}>
              <label className="flex items-center gap-3 rounded-[1.2rem] border border-border/70 bg-surface-glass px-4 py-3 text-sm">
                <input
                  type="checkbox"
                  checked={stealthMode}
                  onChange={(event) => setStealthMode(event.target.checked)}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                <span>{crawlOptionsT('stealthModeHint')}</span>
              </label>
            </Field>
            <Field label={crawlOptionsT('proxyUrl')}>
              <Input
                value={proxyUrl}
                onChange={(event) => setProxyUrl(event.target.value)}
                placeholder="http://proxy.example:8080"
              />
            </Field>
            <Field label={crawlOptionsT('ocrExtraction')}>
              <label className="flex items-center gap-3 rounded-[1.2rem] border border-border/70 bg-surface-glass px-4 py-3 text-sm">
                <input
                  type="checkbox"
                  checked={enableOcr}
                  onChange={(event) => setEnableOcr(event.target.checked)}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                <span>{crawlOptionsT('ocrExtractionHint')}</span>
              </label>
            </Field>
            <Field label={crawlOptionsT('maxOcrImages')}>
              <Input
                type="number"
                min={1}
                max={10}
                value={maxImagesOcr}
                onChange={(event) => setMaxImagesOcr(event.target.value)}
              />
            </Field>
            <Field label={crawlOptionsT('tableDescriptions')}>
              <label className="flex items-center gap-3 rounded-[1.2rem] border border-border/70 bg-surface-glass px-4 py-3 text-sm">
                <input
                  type="checkbox"
                  checked={enableTableDescriptions}
                  onChange={(event) => setEnableTableDescriptions(event.target.checked)}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                <span>{crawlOptionsT('tableDescriptionsHint')}</span>
              </label>
            </Field>
            <Field label={crawlOptionsT('youtubeTranscripts')}>
              <label className="flex items-center gap-3 rounded-[1.2rem] border border-border/70 bg-surface-glass px-4 py-3 text-sm">
                <input
                  type="checkbox"
                  checked={enableYoutubeTranscripts}
                  onChange={(event) => setEnableYoutubeTranscripts(event.target.checked)}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                <span>{crawlOptionsT('youtubeTranscriptsHint')}</span>
              </label>
            </Field>
          </div>
        </ConsoleCard>

        <ConsoleCard
          icon={Activity}
          title={t('analytics.title')}
          body={t('analytics.copy')}
          footer={
            <div className="flex gap-3">
              <Button variant="outline" asChild>
                <Link href={`/insights?agentId=${agentId}`}>{t('analytics.openInsights')}</Link>
              </Button>
              <Button variant="ghost" asChild>
                <Link href={`/agents/${agentId}/analytics`}>{t('analytics.deepDive')}</Link>
              </Button>
            </div>
          }
        >
          <dl className="grid gap-3 sm:grid-cols-2">
            <DataLine
              label={t('analytics.conversations')}
              value={formatNumber(analytics?.summary.total_conversations || 0)}
            />
            <DataLine
              label={t('analytics.messages')}
              value={formatNumber(analytics?.summary.total_messages || 0)}
            />
            <DataLine
              label={t('analytics.confidence')}
              value={`${Math.round((analytics?.summary.avg_confidence || 0) * 100)}%`}
            />
            <DataLine
              label={t('analytics.lowConfidence')}
              value={formatNumber(analytics?.summary.low_confidence_count || 0)}
            />
          </dl>
        </ConsoleCard>

        <ConsoleCard
          icon={Sparkles}
          title={t('eval.title')}
          body={t('eval.copy')}
          footer={
            <Button variant="outline" asChild>
              <Link href={`/agents/${agentId}/eval`}>{t('eval.open')}</Link>
            </Button>
          }
        >
          <p className="text-sm leading-6 text-muted-foreground">{t('eval.description')}</p>
        </ConsoleCard>

        <ConsoleCard
          icon={Link2}
          title={t('shareLinks.title')}
          body={t('shareLinks.copy')}
          footer={
            <div className="flex gap-3">
              <Input
                value={shareLabel}
                onChange={(event) => setShareLabel(event.target.value)}
                placeholder={t('shareLinks.labelPlaceholder')}
              />
              <Button onClick={createShareLink} disabled={busy}>
                {t('shareLinks.create')}
              </Button>
            </div>
          }
        >
          <div className="space-y-3">
            {shareLinks.length ? (
              shareLinks.map((link) => {
                const url =
                  typeof window === 'undefined'
                    ? link.token
                    : `${window.location.origin}/agent/${agent.slug}?token=${link.token}`;

                return (
                  <div
                    key={link.id}
                    className="rounded-[1.3rem] border border-border/70 bg-surface-glass p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">
                          {link.label || t('shareLinks.untitled')}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatDate(link.created_at)}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyValue(url, t('messages.linkCopied'))}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-muted-foreground">{t('shareLinks.empty')}</p>
            )}
          </div>
        </ConsoleCard>
      </div>

      {agent.visibility === 'public' ? (
        <WidgetEmbedSection
          agentId={agent.id}
          agentVisibility={agent.visibility}
          platformUrl={process.env.NEXT_PUBLIC_APP_URL || 'https://agentforge.ai'}
        />
      ) : null}
    </div>
  );
}

function ConsoleMetric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Search;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <div className="mt-1 text-2xl font-semibold">{value}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ConsoleCard({
  icon: Icon,
  title,
  body,
  children,
  footer,
}: {
  icon: typeof Search;
  title: string;
  body: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="space-y-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <CardTitle className="text-xl">{title}</CardTitle>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {children}
        {footer ? <div className="flex flex-wrap gap-3">{footer}</div> : null}
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function DataLine({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[1.2rem] border border-border/70 bg-surface-glass px-4 py-3">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="mt-2 text-lg font-semibold">{value}</div>
    </div>
  );
}
