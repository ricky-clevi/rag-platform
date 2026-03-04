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
  Settings, Save,
} from 'lucide-react';
import type { Agent, AgentSettings } from '@/types';

export default function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations('agents.detail');
  const tCommon = useTranslations('common');
  const [agent, setAgent] = useState<Agent | null>(null);
  const [stats, setStats] = useState({ pages: 0, documents: 0 });
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  // Settings form state
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editIsPublic, setEditIsPublic] = useState(true);
  const [editWelcomeMessage, setEditWelcomeMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    async function fetchAgent() {
      const response = await fetch(`/api/agents/${id}`);
      if (response.ok) {
        const data = await response.json();
        setAgent(data.agent);
        setStats(data.stats);

        // Initialize form state
        setEditName(data.agent.name || '');
        setEditDescription(data.agent.description || '');
        setEditIsPublic(data.agent.is_public ?? true);
        const settings = (data.agent.settings || {}) as AgentSettings;
        setEditWelcomeMessage(settings.welcome_message || '');
      }
      setLoading(false);
    }
    fetchAgent();
  }, [id]);

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
        is_public: editIsPublic,
        settings: {
          ...agent.settings,
          welcome_message: editWelcomeMessage,
        },
      }),
    });

    if (response.ok) {
      const data = await response.json();
      setAgent(data.agent);
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
            href={agent.website_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            <Globe className="h-3 w-3" />
            {agent.website_url}
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
              Documents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-2xl font-bold">{stats.documents}</span>
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

          <div className="flex items-center gap-3">
            <label
              htmlFor="is-public"
              className="flex items-center gap-2 cursor-pointer"
            >
              <input
                id="is-public"
                type="checkbox"
                checked={editIsPublic}
                onChange={(e) => setEditIsPublic(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              <span className="text-sm">
                Public (anyone with the link can chat with this agent)
              </span>
            </label>
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
    </div>
  );
}
