'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/client';
import { formatNumber } from '@/lib/utils/format';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AgentCard } from '@/components/agent/agent-card';
import { CardSkeleton } from '@/components/common/loading-states';
import {
  ArrowRight,
  Bot,
  Database,
  Activity,
  Sparkles,
  PlusCircle,
} from 'lucide-react';
import type { Agent } from '@/types';

interface WorkspaceCard {
  href: '/agents/new' | '/data' | '/monitor' | '/insights';
  key: 'launch' | 'data' | 'monitor' | 'insights';
  icon: typeof Bot;
}

const workspaceCards: WorkspaceCard[] = [
  { href: '/agents/new', key: 'launch', icon: PlusCircle },
  { href: '/data', key: 'data', icon: Database },
  { href: '/monitor', key: 'monitor', icon: Activity },
  { href: '/insights', key: 'insights', icon: Sparkles },
];

export default function DashboardPage() {
  const t = useTranslations('dashboard.home');
  const supabase = useMemo(() => createClient(), []);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function fetchAgents() {
      const { data } = await supabase
        .from('agents')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(6);

      if (!active) return;

      setAgents((data as Agent[]) || []);
      setLoading(false);
    }

    fetchAgents();

    return () => {
      active = false;
    };
  }, [supabase]);

  const readyAgents = agents.filter((agent) => agent.status === 'ready').length;
  const indexedPages = agents.reduce(
    (total, agent) => total + (agent.crawl_stats?.crawled_pages || 0),
    0
  );
  const activeRuns = agents.filter((agent) =>
    ['pending', 'crawling', 'processing'].includes(agent.status)
  ).length;

  const stats = [
    { label: t('stats.totalAgents'), value: agents.length },
    { label: t('stats.readyAgents'), value: readyAgents },
    { label: t('stats.indexedPages'), value: indexedPages },
    { label: t('stats.activeRuns'), value: activeRuns },
  ];

  return (
    <div className="space-y-8">
      <section className="surface-card rounded-[2rem] p-8 md:p-10">
        <div className="grid gap-8 lg:grid-cols-[1.08fr_0.92fr] lg:items-end">
          <div className="space-y-4">
            <span className="eyebrow">{t('eyebrow')}</span>
            <h1 className="balanced-heading text-4xl font-semibold tracking-tight md:text-5xl">
              {t('title')}
            </h1>
            <p className="pretty-copy max-w-2xl text-base text-muted-foreground">
              {t('subtitle')}
            </p>
          </div>

          <div className="metric-grid">
            {stats.map((item) => (
              <div
                key={item.label}
                className="rounded-[1.4rem] border border-border/70 bg-white/72 p-5"
              >
                <p className="text-sm text-muted-foreground">{item.label}</p>
                <div className="mt-3 text-3xl font-semibold">
                  {loading ? '...' : formatNumber(item.value)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-semibold">{t('workspaces.title')}</h2>
          <Button variant="ghost" asChild>
            <Link href="/agents/new">
              {t('workspaces.cta')}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {workspaceCards.map((card) => (
            <Card key={card.href}>
              <CardHeader className="space-y-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
                  <card.icon className="h-5 w-5" />
                </div>
                <CardTitle className="text-xl">{t(`workspaces.${card.key}.title`)}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm leading-6 text-muted-foreground">
                  {t(`workspaces.${card.key}.description`)}
                </p>
                <Button variant="outline" className="w-full justify-between" asChild>
                  <Link href={card.href}>
                    {t('workspaces.open')}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-semibold">{t('recentAgents')}</h2>
          <Button variant="ghost" asChild>
            <Link href="/agents">{t('viewAll')}</Link>
          </Button>
        </div>

        {loading ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <CardSkeleton key={index} />
            ))}
          </div>
        ) : agents.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12">
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                {t('empty')}
              </p>
              <Button className="mt-6" asChild>
                <Link href="/agents/new">{t('emptyCta')}</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {agents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
