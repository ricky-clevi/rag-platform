'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/client';
import { formatDate, formatNumber } from '@/lib/utils/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { MessageSquareMore, Sparkles, Gauge, AlertTriangle } from 'lucide-react';
import type { Agent } from '@/types';

interface AnalyticsPayload {
  summary: {
    total_conversations: number;
    total_messages: number;
    avg_confidence: number;
    low_confidence_count: number;
    unique_sessions: number;
  };
  crawl_history: Array<{
    id: string;
    status: string;
    total_urls_crawled: number;
    total_chunks_created: number;
    started_at: string | null;
    completed_at: string | null;
  }>;
  recent_conversations: Array<{
    id: string;
    title: string | null;
    message_count: number;
    created_at: string;
  }>;
}

export default function InsightsPage() {
  const t = useTranslations('insights');
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function fetchAgents() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active || !user) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from('agents')
        .select('*')
        .eq('user_id', user.id)
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

  useEffect(() => {
    let active = true;

    async function fetchAnalytics() {
      if (!selectedAgentId) return;

      setLoading(true);
      const response = await fetch(`/api/agents/${selectedAgentId}/analytics?days=30`);
      const data = await response.json();

      if (!active) return;

      setAnalytics(response.ok ? data : null);
      setLoading(false);
    }

    void fetchAnalytics();

    return () => {
      active = false;
    };
  }, [selectedAgentId]);

  const metrics = analytics?.summary;

  return (
    <div className="space-y-6">
      <section className="surface-card rounded-[2rem] p-8 md:p-10">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <span className="eyebrow">{t('eyebrow')}</span>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight">{t('title')}</h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-muted-foreground">
              {t('subtitle')}
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href={selectedAgentId ? `/agents/${selectedAgentId}/eval` : '/agents'}>
              {t('openEval')}
            </Link>
          </Button>
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{t('agentLabel')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="insights-agent" className="sr-only">
            {t('agentLabel')}
          </Label>
          <select
            id="insights-agent"
            value={selectedAgentId}
            onChange={(event) => setSelectedAgentId(event.target.value)}
            className="flex h-11 w-full rounded-2xl border border-input bg-surface-glass px-4 text-sm outline-none transition-[border-color,box-shadow] focus:border-primary/40 focus:ring-4 focus:ring-primary/10 md:max-w-md"
          >
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      <div className="metric-grid">
        <InsightMetric
          icon={MessageSquareMore}
          label={t('metrics.conversations')}
          value={loading || !metrics ? '...' : formatNumber(metrics.total_conversations)}
        />
        <InsightMetric
          icon={Sparkles}
          label={t('metrics.messages')}
          value={loading || !metrics ? '...' : formatNumber(metrics.total_messages)}
        />
        <InsightMetric
          icon={Gauge}
          label={t('metrics.confidence')}
          value={
            loading || !metrics
              ? '...'
              : `${Math.round((metrics.avg_confidence || 0) * 100)}%`
          }
        />
        <InsightMetric
          icon={AlertTriangle}
          label={t('metrics.lowConfidence')}
          value={loading || !metrics ? '...' : formatNumber(metrics.low_confidence_count)}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('conversations.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {analytics?.recent_conversations?.length ? (
              analytics.recent_conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className="rounded-[1.3rem] border border-border/70 bg-surface-glass p-4"
                >
                  <p className="text-sm font-medium">
                    {conversation.title || t('conversations.untitled')}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t('conversations.meta', {
                      count: formatNumber(conversation.message_count),
                      date: formatDate(conversation.created_at),
                    })}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">{t('conversations.empty')}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('crawlHistory.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {analytics?.crawl_history?.length ? (
              analytics.crawl_history.map((job) => (
                <div
                  key={job.id}
                  className="rounded-[1.3rem] border border-border/70 bg-surface-glass p-4"
                >
                  <p className="text-sm font-medium">{job.status}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t('crawlHistory.meta', {
                      urls: formatNumber(job.total_urls_crawled),
                      chunks: formatNumber(job.total_chunks_created),
                    })}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">{t('crawlHistory.empty')}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InsightMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MessageSquareMore;
  label: string;
  value: string;
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
