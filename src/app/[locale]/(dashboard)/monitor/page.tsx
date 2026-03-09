'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { formatDate, formatNumber } from '@/lib/utils/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Activity, AlertTriangle, Clock3, FileWarning, RefreshCcw } from 'lucide-react';
import type { Agent, CrawlJobMetrics } from '@/types';

interface MonitorPayload {
  policy: {
    enabled: boolean;
    frequency_hours: number;
    next_run_at: string | null;
  } | null;
  recentJobs: Array<{
    id: string;
    status: string;
    job_type: string;
    total_urls_crawled: number;
    created_at: string;
  }>;
  changedPages: number;
  crawlHealth: CrawlJobMetrics;
}

export default function MonitorPage() {
  const t = useTranslations('monitor');
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [payload, setPayload] = useState<MonitorPayload | null>(null);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    let active = true;

    async function fetchMonitorPayload() {
      if (!selectedAgentId) return;

      setLoading(true);
      const response = await fetch(`/api/data/monitor/${selectedAgentId}`);
      const data = await response.json();

      if (!active) return;

      setPayload(response.ok ? data : null);
      setLoading(false);
    }

    void fetchMonitorPayload();

    return () => {
      active = false;
    };
  }, [selectedAgentId]);

  const metrics = payload?.crawlHealth;

  return (
    <div className="space-y-6">
      <section className="surface-card rounded-[2rem] p-8 md:p-10">
        <span className="eyebrow">{t('eyebrow')}</span>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-muted-foreground">
          {t('subtitle')}
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{t('agentLabel')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="monitor-agent" className="sr-only">
            {t('agentLabel')}
          </Label>
          <select
            id="monitor-agent"
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
        <MetricCard
          icon={RefreshCcw}
          label={t('metrics.changedPages')}
          value={loading || !payload ? '...' : formatNumber(payload.changedPages)}
        />
        <MetricCard
          icon={Activity}
          label={t('metrics.discovered')}
          value={loading || !metrics ? '...' : formatNumber(metrics.discovered_urls)}
        />
        <MetricCard
          icon={Clock3}
          label={t('metrics.crawled')}
          value={loading || !metrics ? '...' : formatNumber(metrics.crawled_urls)}
        />
        <MetricCard
          icon={AlertTriangle}
          label={t('metrics.throughput')}
          value={
            loading || !metrics
              ? '...'
              : `${formatNumber(metrics.pages_per_minute || 0)} / min`
          }
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardHeader>
            <CardTitle>{t('policy.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <Badge variant={payload?.policy?.enabled ? 'success' : 'outline'}>
              {payload?.policy?.enabled ? t('policy.enabled') : t('policy.disabled')}
            </Badge>
            <p className="text-muted-foreground">
              {payload?.policy
                ? t('policy.cadence', { hours: payload.policy.frequency_hours })
                : t('policy.empty')}
            </p>
            <p className="text-muted-foreground">
              {payload?.policy?.next_run_at
                ? t('policy.nextRun', {
                    date: formatDate(payload.policy.next_run_at),
                  })
                : t('policy.noNextRun')}
            </p>
            {metrics?.failure_reason ? (
              <div className="rounded-[1.3rem] border border-destructive/20 bg-destructive/10 p-4 text-destructive">
                {metrics.failure_reason}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('jobs.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {payload?.recentJobs?.length ? (
              payload.recentJobs.map((job) => (
                <div
                  key={job.id}
                  className="rounded-[1.3rem] border border-border/70 bg-surface-glass p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <Badge
                      variant={
                        job.status === 'completed'
                          ? 'success'
                          : job.status === 'failed'
                            ? 'destructive'
                            : 'secondary'
                      }
                    >
                      {job.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(job.created_at)}
                    </span>
                  </div>
                  <p className="mt-3 text-sm font-medium">{job.job_type}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t('jobs.crawledCount', {
                      count: formatNumber(job.total_urls_crawled),
                    })}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">{t('jobs.empty')}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('failures.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {metrics?.failed_urls ? (
            <div className="rounded-[1.3rem] border border-border/70 bg-surface-glass p-4">
              <div className="flex items-center gap-3">
                <FileWarning className="h-5 w-5 text-destructive" />
                <p className="text-sm font-medium text-foreground">
                  {formatNumber(metrics.failed_urls)}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('failures.empty')}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Activity;
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
