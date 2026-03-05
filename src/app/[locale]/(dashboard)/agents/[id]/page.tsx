'use client';

import { useEffect, useState, use } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { FullPageLoader, Spinner } from '@/components/common/loading-states';
import { AgentStatusBadge } from '@/components/agent/agent-status';
import {
  Globe, MessageSquare, FileText, Share2, Copy, Check, RefreshCw,
  Settings, Save, BarChart3, Clock, AlertCircle, Sparkles, Eye, EyeOff,
} from 'lucide-react';
import type { Agent, AgentSettings } from '@/types';

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
  const [editWelcomeMessage, setEditWelcomeMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Crawl report (#5)
  const [crawledPages, setCrawledPages] = useState<CrawledPage[]>([]);
  const [pageFilter, setPageFilter] = useState<string>('all');
  const [showPages, setShowPages] = useState(false);

  // Recrawl policy (#28)
  const [recrawlPolicy, setRecrawlPolicy] = useState<RecrawlPolicy | null>(null);
  const [recrawlEnabled, setRecrawlEnabled] = useState(false);
  const [recrawlFrequency, setRecrawlFrequency] = useState(168);

  // Auto-generate starters (#39)
  const [generatingStarters, setGeneratingStarters] = useState(false);

  useEffect(() => {
    async function fetchAgent() {
      const response = await fetch(`/api/agents/${id}`);
      if (response.ok) {
        const data = await response.json();
        setAgent(data.agent);
        setAgentSettings(data.settings);
        setStats(data.stats);

        // Initialize form state
        setEditName(data.agent.name || '');
        setEditDescription(data.agent.description || '');
        setEditVisibility(data.agent.visibility || 'public');
        setEditWelcomeMessage(data.settings?.welcome_message || '');
      }
      setLoading(false);
    }
    fetchAgent();
  }, [id]);

  // Fetch crawled pages (#5)
  useEffect(() => {
    if (!showPages) return;
    const statusParam = pageFilter !== 'all' ? `&status=${pageFilter}` : '';
    fetch(`/api/agents/${id}/pages?limit=100${statusParam}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setCrawledPages(d.pages || []); });
  }, [id, showPages, pageFilter]);

  // Fetch recrawl policy (#28)
  useEffect(() => {
    fetch(`/api/agents/${id}/recrawl-policy`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d?.policy) {
          setRecrawlPolicy(d.policy);
          setRecrawlEnabled(d.policy.enabled);
          setRecrawlFrequency(d.policy.frequency_hours);
        }
      });
  }, [id]);

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
      setAgentSettings((prev) => prev ? { ...prev, starter_questions: data.starter_questions } : prev);
    }
    setGeneratingStarters(false);
  };

  const handleCopyLink = async () => {
    if (!agent) return;
    const shareUrl = `${window.location.origin}/agent/${agent.slug}`;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReCrawl = async () => {
    if (!agent) return;
    await fetch('/api/crawl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: agent.id }),
    });
    window.location.reload();
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
        settings: {
          welcome_message: editWelcomeMessage,
        },
      }),
    });

    if (response.ok) {
      const data = await response.json();
      setAgent(data.agent);
      setAgentSettings(data.settings);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }

    setSaving(false);
  };

  if (loading) return <FullPageLoader />;
  if (!agent) return <div>Agent not found</div>;

  const shareUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/agent/${agent.slug}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold truncate">{agent.name}</h1>
            <AgentStatusBadge status={agent.status} />
          </div>
          <p className="mt-1 text-muted-foreground">{agent.description}</p>
          <a
            href={agent.root_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            <Globe className="h-3 w-3" />
            {agent.root_url}
          </a>
        </div>
        <div className="flex gap-2 shrink-0">
          {agent.status === 'ready' && (
            <Button asChild>
              <Link href={`/agent/${agent.slug}`}>
                <MessageSquare className="mr-2 h-4 w-4" />
                Chat
              </Link>
            </Button>
          )}
          <Button variant="outline" onClick={handleReCrawl}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {t('rebuild')}
          </Button>
        </div>
      </div>

      <Separator />

      {/* Stats */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('pages')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-2xl font-bold">{stats.pages}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Chunks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-2xl font-bold">{stats.chunks}</span>
            </div>
          </CardContent>
        </Card>
        <Card className="col-span-2 md:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={agent.status === 'ready' ? 'success' : 'secondary'}>
              {agent.status}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Settings Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Settings className="h-5 w-5" />
            {t('settings')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="agent-name">Agent Name</Label>
            <Input
              id="agent-name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="agent-description">Description</Label>
            <Input
              id="agent-description"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="welcome-message">Welcome Message</Label>
            <textarea
              id="welcome-message"
              value={editWelcomeMessage}
              onChange={(e) => setEditWelcomeMessage(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              placeholder="Hello! Ask me anything about this company..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="visibility">Visibility</Label>
            <select
              id="visibility"
              value={editVisibility}
              onChange={(e) => setEditVisibility(e.target.value as 'public' | 'private' | 'passcode')}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="public">Public (anyone with the link can chat)</option>
              <option value="private">Private (only you can access)</option>
              <option value="passcode">Passcode Protected</option>
            </select>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={handleSaveSettings} disabled={saving}>
              {saving ? (
                <Spinner className="mr-2" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {tCommon('save')}
            </Button>
            {saveSuccess && (
              <span className="text-sm text-green-600 flex items-center gap-1">
                <Check className="h-4 w-4" />
                Saved!
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Share Link */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Share2 className="h-5 w-5" />
            {t('shareLink')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <code className="flex-1 rounded-md bg-muted px-3 py-2 text-sm break-all">
              {shareUrl}
            </code>
            <Button variant="outline" size="sm" onClick={handleCopyLink} className="shrink-0">
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

      {/* Auto-generate Starter Questions (#39) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5" />
            Starter Questions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {agentSettings?.starter_questions && agentSettings.starter_questions.length > 0 ? (
            <div className="space-y-1">
              {agentSettings.starter_questions.map((q, i) => (
                <p key={i} className="text-sm text-muted-foreground">• {q}</p>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No starter questions configured.</p>
          )}
          <Button variant="outline" size="sm" onClick={handleGenerateStarters} disabled={generatingStarters}>
            <Sparkles className="mr-1 h-3 w-3" />
            {generatingStarters ? 'Generating...' : 'Auto-generate with AI'}
          </Button>
        </CardContent>
      </Card>

      {/* Recrawl Management (#28) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="h-5 w-5" />
            Scheduled Recrawl
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
              <span className="text-sm">Enable automatic recrawl</span>
            </label>
          </div>

          {recrawlEnabled && (
            <div className="space-y-2">
              <Label>Frequency</Label>
              <select
                value={recrawlFrequency}
                onChange={(e) => setRecrawlFrequency(parseInt(e.target.value))}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value={24}>Every day</option>
                <option value={72}>Every 3 days</option>
                <option value={168}>Every week</option>
                <option value={336}>Every 2 weeks</option>
                <option value={720}>Every month</option>
              </select>
            </div>
          )}

          {recrawlPolicy?.next_run_at && recrawlPolicy.enabled && (
            <p className="text-xs text-muted-foreground">
              Next run: {new Date(recrawlPolicy.next_run_at).toLocaleString()}
            </p>
          )}

          <Button variant="outline" size="sm" onClick={handleSaveRecrawlPolicy}>
            <Save className="mr-1 h-3 w-3" />
            Save Schedule
          </Button>
        </CardContent>
      </Card>

      {/* Crawl Report (#5) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-lg">
            <span className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Crawl Report
            </span>
            <Button variant="ghost" size="sm" onClick={() => setShowPages(!showPages)}>
              {showPages ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </CardTitle>
        </CardHeader>
        {showPages && (
          <CardContent className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              {['all', 'crawled', 'skipped', 'blocked', 'failed'].map((status) => (
                <Button
                  key={status}
                  variant={pageFilter === status ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPageFilter(status)}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </Button>
              ))}
            </div>
            <div className="max-h-96 overflow-y-auto space-y-1">
              {crawledPages.length > 0 ? (
                crawledPages.map((page) => (
                  <div key={page.id} className="flex items-center justify-between py-1.5 border-b text-sm">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Badge variant={
                        page.crawl_status === 'crawled' ? 'success'
                        : page.crawl_status === 'failed' ? 'destructive'
                        : page.crawl_status === 'blocked' ? 'destructive'
                        : 'secondary'
                      }>
                        {page.crawl_status}
                      </Badge>
                      <span className="truncate text-xs">{page.url}</span>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      {page.skip_reason && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          {page.skip_reason}
                        </span>
                      )}
                      <Badge variant="outline" className="text-xs">{page.page_type}</Badge>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No pages found.</p>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Quick Links */}
      <div className="flex gap-3">
        <Button asChild variant="outline" size="sm">
          <Link href={`/agents/${id}/analytics`}>
            <BarChart3 className="mr-1 h-3 w-3" />
            Analytics
          </Link>
        </Button>
      </div>
    </div>
  );
}
