'use client';

import { useEffect, useState, use } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { FullPageLoader } from '@/components/common/loading-states';
import { AgentStatusBadge } from '@/components/agent/agent-status';
import {
  Globe, MessageSquare, FileText, Share2, Copy, Check, RefreshCw,
} from 'lucide-react';
import type { Agent } from '@/types';

export default function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations('agents.detail');
  const [agent, setAgent] = useState<Agent | null>(null);
  const [stats, setStats] = useState({ pages: 0, documents: 0 });
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function fetchAgent() {
      const response = await fetch(`/api/agents/${id}`);
      if (response.ok) {
        const data = await response.json();
        setAgent(data.agent);
        setStats(data.stats);
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

  if (loading) return <FullPageLoader />;
  if (!agent) return <div>Agent not found</div>;

  const shareUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/agent/${agent.slug}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{agent.name}</h1>
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
        <div className="flex gap-2">
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
      <div className="grid gap-4 md:grid-cols-3">
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
        <Card>
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

      {/* Share Link */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Share2 className="h-5 w-5" />
            {t('shareLink')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-md bg-muted px-3 py-2 text-sm">
              {shareUrl}
            </code>
            <Button variant="outline" size="sm" onClick={handleCopyLink}>
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
