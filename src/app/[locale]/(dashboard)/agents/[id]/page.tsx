'use client';

import { useEffect, useState, use } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { FullPageLoader, Spinner } from '@/components/common/loading-states';
import { AgentStatusBadge } from '@/components/agent/agent-status';
import * as Tabs from '@radix-ui/react-tabs';
import {
  Globe, MessageSquare, FileText, Share2, Copy, Check, RefreshCw,
  Settings, Save, BarChart3, Clock, AlertCircle, Sparkles, Eye, EyeOff,
  Database, Activity, Link2, Shield, Zap, CheckCircle2, XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { Agent, AgentSettings } from '@/types';

// ─── Helper components ────────────────────────────────────────────────────────

function AgentFavicon({ url, name }: { url: string; name: string }) {
  const [failed, setFailed] = useState(false);
  let domain = '';
  try {
    domain = new URL(url).hostname;
  } catch {}

  if (failed || !domain) {
    return (
      <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-violet-500 flex items-center justify-center text-white font-bold text-lg shrink-0">
        {name[0]?.toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
      alt=""
      width={40}
      height={40}
      className="h-10 w-10 rounded-xl object-contain border border-border bg-muted shrink-0"
      onError={() => setFailed(true)}
    />
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
  isStatus,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
  isStatus?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}

// ─── Page types ───────────────────────────────────────────────────────────────

interface CrawledPage {
  id: string;
  url: string;
  title: string | null;
  crawl_status: string;
  skip_reason: string | null;
  page_type: string;
  last_crawled_at: string | null;
}

interface RecrawlPolicy {
  enabled: boolean;
  frequency_hours: number;
  last_run_at: string | null;
  next_run_at: string | null;
}

// ─── Page component ───────────────────────────────────────────────────────────

export default function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations('agents.detail');
  const tCommon = useTranslations('common');

  const [agent, setAgent] = useState<Agent | null>(null);
  const [agentSettings, setAgentSettings] = useState<AgentSettings | null>(null);
  const [stats, setStats] = useState({ pages: 0, chunks: 0 });
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  // Settings form state
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editVisibility, setEditVisibility] = useState<'public' | 'private' | 'passcode'>('public');
  const [editPasscode, setEditPasscode] = useState('');
  const [editWelcomeMessage, setEditWelcomeMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Crawl report
  const [crawledPages, setCrawledPages] = useState<CrawledPage[]>([]);
  const [pageFilter, setPageFilter] = useState<string>('all');
  const [showPages, setShowPages] = useState(false);

  // Recrawl policy
  const [recrawlPolicy, setRecrawlPolicy] = useState<RecrawlPolicy | null>(null);
  const [recrawlEnabled, setRecrawlEnabled] = useState(false);
  const [recrawlFrequency, setRecrawlFrequency] = useState(168);

  // Auto-generate starters
  const [generatingStarters, setGeneratingStarters] = useState(false);

  // Re-crawl error
  const [recrawlError, setRecrawlError] = useState('');

  // ── Data fetching ────────────────────────────────────────────────────────────

  useEffect(() => {
    async function fetchAgent() {
      const response = await fetch(`/api/agents/${id}`);
      if (response.ok) {
        const data = await response.json();
        setAgent(data.agent);
        setAgentSettings(data.settings);
        setStats(data.stats);

        // Initialise form state
        setEditName(data.agent.name || '');
        setEditDescription(data.agent.description || '');
        setEditVisibility(data.agent.visibility || 'public');
        setEditWelcomeMessage(data.settings?.welcome_message || '');
      }
      setLoading(false);
    }
    fetchAgent();
  }, [id]);

  // Fetch crawled pages
  useEffect(() => {
    if (!showPages) return;
    const statusParam = pageFilter !== 'all' ? `&status=${pageFilter}` : '';
    fetch(`/api/agents/${id}/pages?limit=100${statusParam}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setCrawledPages(d.pages || []);
      });
  }, [id, showPages, pageFilter]);

  // Fetch recrawl policy
  useEffect(() => {
    fetch(`/api/agents/${id}/recrawl-policy`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.policy) {
          setRecrawlPolicy(d.policy);
          setRecrawlEnabled(d.policy.enabled);
          setRecrawlFrequency(d.policy.frequency_hours);
        }
      });
  }, [id]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleSaveRecrawlPolicy = async () => {
    const response = await fetch(`/api/agents/${id}/recrawl-policy`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: recrawlEnabled, frequency_hours: recrawlFrequency }),
    });
    if (response.ok) {
      const data = await response.json();
      setRecrawlPolicy(data.policy);
    }
  };

  const handleGenerateStarters = async () => {
    setGeneratingStarters(true);
    const response = await fetch(`/api/agents/${id}/generate-starters`, { method: 'POST' });
    if (response.ok) {
      const data = await response.json();
      setAgentSettings((prev) =>
        prev ? { ...prev, starter_questions: data.starter_questions } : prev
      );
    }
    setGeneratingStarters(false);
  };

  const handleCopyLink = async () => {
    if (!agent) return;
    try {
      const shareUrl = `${window.location.origin}/agent/${agent.slug}`;
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may not be available in insecure contexts
    }
  };

  const handleReCrawl = async () => {
    if (!agent) return;
    setRecrawlError('');
    try {
      const response = await fetch('/api/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agent.id }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setRecrawlError(data.error || t('recrawlFailed'));
        return;
      }
      window.location.reload();
    } catch {
      setRecrawlError(t('recrawlFailed'));
    }
  };

  const handleSaveSettings = async () => {
    if (!agent) return;
    setSaving(true);
    setSaveSuccess(false);

    const response = await fetch(`/api/agents/${agent.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editName,
        description: editDescription,
        visibility: editVisibility,
        passcode:
          editVisibility === 'passcode' && editPasscode.trim()
            ? editPasscode.trim()
            : undefined,
        settings: {
          welcome_message: editWelcomeMessage,
        },
      }),
    });

    if (response.ok) {
      const data = await response.json();
      setAgent(data.agent);
      setAgentSettings(data.settings);
      setEditPasscode('');
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }

    setSaving(false);
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) return <FullPageLoader />;
  if (!agent) return <div>{tCommon('noResults')}</div>;

  const shareUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/agent/${agent.slug}`;

  return (
    <div className="space-y-6">
      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <AgentFavicon url={agent.root_url} name={agent.name} />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold truncate">{agent.name}</h1>
                <AgentStatusBadge status={agent.status} />
              </div>
              <a
                href={agent.root_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1"
              >
                <Globe className="h-3 w-3" />
                {agent.root_url}
              </a>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 shrink-0">
          <div className="flex gap-2">
            {agent.status === 'ready' && (
              <Button asChild>
                <Link href={`/agent/${agent.slug}`}>
                  <MessageSquare className="mr-2 h-4 w-4" />
                  {t('chat')}
                </Link>
              </Button>
            )}
            <Button variant="outline" onClick={handleReCrawl}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {t('rebuild')}
            </Button>
          </div>
          {recrawlError && (
            <p className="text-sm text-destructive flex items-center gap-1">
              <AlertCircle className="h-4 w-4" />
              {recrawlError}
            </p>
          )}
        </div>
      </div>

      {/* ── Stats row ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={<FileText className="h-4 w-4 text-blue-500" />}
          label={t('pages')}
          value={stats.pages}
          color="blue"
        />
        <StatCard
          icon={<Database className="h-4 w-4 text-violet-500" />}
          label={t('chunks')}
          value={stats.chunks}
          color="violet"
        />
        <StatCard
          icon={<Activity className="h-4 w-4 text-emerald-500" />}
          label={t('status')}
          value={agent.status}
          color="emerald"
          isStatus
        />
        <StatCard
          icon={<Clock className="h-4 w-4 text-amber-500" />}
          label="Last Crawl"
          value={
            agent.crawl_stats?.completed_at
              ? new Date(agent.crawl_stats.completed_at).toLocaleDateString()
              : '—'
          }
          color="amber"
        />
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────────── */}
      <Tabs.Root defaultValue="overview" className="space-y-4">
        <Tabs.List className="flex h-10 items-center gap-1 rounded-xl bg-muted p-1 w-fit">
          {[
            { value: 'overview', label: 'Overview', icon: BarChart3 },
            { value: 'settings', label: 'Settings', icon: Settings },
            { value: 'share', label: 'Share', icon: Share2 },
            { value: 'knowledge', label: 'Knowledge', icon: Database },
          ].map((tab) => (
            <Tabs.Trigger
              key={tab.value}
              value={tab.value}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm hover:text-foreground"
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        {/* ── OVERVIEW TAB ───────────────────────────────────────────────────── */}
        <Tabs.Content value="overview" className="space-y-4">
          {/* Crawl Report */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  {t('crawlReport')}
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPages(!showPages)}
                  aria-label={t('toggleCrawlReport')}
                  aria-expanded={showPages}
                >
                  {showPages ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </CardHeader>
            {showPages && (
              <CardContent className="space-y-3">
                {/* Filter buttons */}
                <div className="flex gap-1.5 flex-wrap">
                  {['all', 'crawled', 'skipped', 'blocked', 'failed'].map((status) => (
                    <button
                      key={status}
                      onClick={() => setPageFilter(status)}
                      className={cn(
                        'rounded-lg px-3 py-1 text-xs font-medium transition-colors',
                        pageFilter === status
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      )}
                    >
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </button>
                  ))}
                </div>

                <div className="max-h-80 overflow-y-auto space-y-0.5 rounded-lg border">
                  {crawledPages.length > 0 ? (
                    crawledPages.map((page) => (
                      <div
                        key={page.id}
                        className="flex items-center gap-2 px-3 py-2 text-sm border-b last:border-0 hover:bg-muted/50"
                      >
                        <Badge
                          variant={
                            page.crawl_status === 'crawled'
                              ? 'success'
                              : page.crawl_status === 'failed'
                              ? 'destructive'
                              : page.crawl_status === 'blocked'
                              ? 'destructive'
                              : 'secondary'
                          }
                          className="shrink-0 text-[10px]"
                        >
                          {page.crawl_status}
                        </Badge>
                        <span className="truncate text-xs text-muted-foreground flex-1">
                          {page.url}
                        </span>
                        {page.skip_reason && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                            <AlertCircle className="h-3 w-3" />
                            {page.skip_reason}
                          </span>
                        )}
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          {page.page_type}
                        </Badge>
                      </div>
                    ))
                  ) : (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      {t('noPagesFound')}
                    </p>
                  )}
                </div>
              </CardContent>
            )}
          </Card>

          {/* Scheduled Recrawl */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4" />
                {t('scheduledRecrawl')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={recrawlEnabled}
                    onChange={(e) => setRecrawlEnabled(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm">{t('enableRecrawl')}</span>
                </label>
              </div>

              {recrawlEnabled && (
                <div className="space-y-2">
                  <Label>{t('frequency')}</Label>
                  <select
                    value={recrawlFrequency}
                    onChange={(e) => setRecrawlFrequency(parseInt(e.target.value))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value={24}>{t('everyDay')}</option>
                    <option value={72}>{t('every3Days')}</option>
                    <option value={168}>{t('everyWeek')}</option>
                    <option value={336}>{t('every2Weeks')}</option>
                    <option value={720}>{t('everyMonth')}</option>
                  </select>
                </div>
              )}

              {recrawlPolicy?.next_run_at && recrawlPolicy.enabled && (
                <p className="text-xs text-muted-foreground">
                  {t('nextRun', { date: new Date(recrawlPolicy.next_run_at).toLocaleString() })}
                </p>
              )}

              <Button variant="outline" size="sm" onClick={handleSaveRecrawlPolicy}>
                <Save className="mr-1 h-3 w-3" />
                {t('saveSchedule')}
              </Button>
            </CardContent>
          </Card>

          {/* Quick links */}
          <div className="flex gap-3">
            <Button asChild variant="outline" size="sm">
              <Link href={`/agents/${id}/analytics`}>
                <BarChart3 className="mr-1 h-3 w-3" />
                {t('analytics')}
              </Link>
            </Button>
          </div>
        </Tabs.Content>

        {/* ── SETTINGS TAB ───────────────────────────────────────────────────── */}
        <Tabs.Content value="settings" className="space-y-4">
          {/* Agent Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('settings')}</CardTitle>
              <CardDescription>
                Update your agent&apos;s name, description, and behavior.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="agent-name">{t('agentName')}</Label>
                <Input
                  id="agent-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="agent-description">{t('description')}</Label>
                <Input
                  id="agent-description"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="welcome-message">{t('welcomeMessage')}</Label>
                <textarea
                  id="welcome-message"
                  value={editWelcomeMessage}
                  onChange={(e) => setEditWelcomeMessage(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  placeholder={t('welcomePlaceholder')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="visibility">{t('visibility')}</Label>
                <select
                  id="visibility"
                  value={editVisibility}
                  onChange={(e) =>
                    setEditVisibility(e.target.value as 'public' | 'private' | 'passcode')
                  }
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="public">{t('visibilityPublic')}</option>
                  <option value="private">{t('visibilityPrivate')}</option>
                  <option value="passcode">{t('visibilityPasscode')}</option>
                </select>
              </div>

              {editVisibility === 'passcode' && (
                <div className="space-y-2">
                  <Label htmlFor="passcode">{t('passcode')}</Label>
                  <Input
                    id="passcode"
                    type="password"
                    value={editPasscode}
                    onChange={(e) => setEditPasscode(e.target.value)}
                    placeholder={t('passcodePlaceholder')}
                    minLength={4}
                  />
                  <p className="text-xs text-muted-foreground">{t('passcodeHint')}</p>
                </div>
              )}

              <div className="flex items-center gap-3">
                <Button onClick={handleSaveSettings} disabled={saving}>
                  {saving ? <Spinner className="mr-2" /> : <Save className="mr-2 h-4 w-4" />}
                  {tCommon('save')}
                </Button>
                {saveSuccess && (
                  <span className="text-sm text-green-600 flex items-center gap-1">
                    <Check className="h-4 w-4" />
                    {t('saved')}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Starter Questions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                {t('starterQuestions')}
              </CardTitle>
              <CardDescription>
                AI-generated conversation starters shown to users.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {agentSettings?.starter_questions && agentSettings.starter_questions.length > 0 ? (
                <div className="space-y-1">
                  {agentSettings.starter_questions.map((q, i) => (
                    <p key={i} className="text-sm text-muted-foreground">
                      • {q}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t('noStarters')}</p>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateStarters}
                disabled={generatingStarters}
              >
                <Sparkles className="mr-1 h-3 w-3" />
                {generatingStarters ? t('generating') : t('autoGenerate')}
              </Button>
            </CardContent>
          </Card>
        </Tabs.Content>

        {/* ── SHARE TAB ──────────────────────────────────────────────────────── */}
        <Tabs.Content value="share" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                {t('shareLink')}
              </CardTitle>
              <CardDescription>
                Share this link to let anyone chat with your agent.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <code className="flex-1 rounded-md bg-muted px-3 py-2 text-sm break-all">
                  {shareUrl}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyLink}
                  className="shrink-0"
                >
                  {copied ? (
                    <>
                      <Check className="mr-1 h-4 w-4" />
                      {t('copied')}
                    </>
                  ) : (
                    <>
                      <Copy className="mr-1 h-4 w-4" />
                      {t('copyLink')}
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </Tabs.Content>

        {/* ── KNOWLEDGE TAB ──────────────────────────────────────────────────── */}
        <Tabs.Content value="knowledge">
          <Card>
            <CardContent className="py-8 text-center">
              <Database className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-3">
                Browse your agent&apos;s knowledge base
              </p>
              <Button variant="outline" asChild>
                <Link href={`/agents/${agent.id}/knowledge`}>Open Knowledge Browser</Link>
              </Button>
            </CardContent>
          </Card>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
