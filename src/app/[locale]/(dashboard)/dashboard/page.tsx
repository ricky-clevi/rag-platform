'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { AgentCard } from '@/components/agent/agent-card';
import { CardSkeleton } from '@/components/common/loading-states';
import { Bot, CheckCircle2, FileText, MessageSquare, PlusCircle, ArrowRight } from 'lucide-react';
import type { Agent } from '@/types';

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();

      // Fetch user info
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email ?? null);
        setUserName(user.user_metadata?.full_name ?? user.user_metadata?.name ?? null);
      }

      // Fetch agents
      const { data } = await supabase
        .from('agents')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(6);

      setAgents((data as Agent[]) || []);
      setLoading(false);
    }
    fetchData();
  }, []);

  const readyAgents = agents.filter((a) => a.status === 'ready');
  const totalPages = agents.reduce(
    (sum, a) => sum + (a.crawl_stats?.crawled_pages ?? 0),
    0
  );

  const displayName = userName ?? userEmail?.split('@')[0] ?? 'there';

  return (
    <div className="space-y-8">
      {/* Welcome greeting */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Good {getGreeting()},{' '}
            <span className="gradient-text capitalize">{displayName}</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('welcome')}</p>
        </div>
        <Button asChild className="shrink-0 self-start sm:self-auto">
          <Link href="/agents/new">
            <PlusCircle className="mr-2 h-4 w-4" />
            Create New Agent
          </Link>
        </Button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          title={t('stats.totalAgents')}
          value={loading ? null : agents.length}
          icon={<Bot className="h-5 w-5 text-white" />}
          iconBg="bg-indigo-500"
          trend={agents.length > 0 ? `${agents.length} total` : 'No agents yet'}
        />
        <StatCard
          title={t('stats.activeAgents')}
          value={loading ? null : readyAgents.length}
          icon={<CheckCircle2 className="h-5 w-5 text-white" />}
          iconBg="bg-emerald-500"
          trend={
            agents.length > 0
              ? `${Math.round((readyAgents.length / agents.length) * 100)}% ready`
              : 'None ready'
          }
        />
        <StatCard
          title="Total Pages"
          value={loading ? null : totalPages}
          icon={<FileText className="h-5 w-5 text-white" />}
          iconBg="bg-blue-500"
          trend="Indexed pages"
        />
        <StatCard
          title={t('stats.totalConversations')}
          value={loading ? null : '-'}
          icon={<MessageSquare className="h-5 w-5 text-white" />}
          iconBg="bg-violet-500"
          trend="All time"
        />
      </div>

      {/* Recent Agents */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">{t('recentAgents')}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Your latest 6 agents</p>
          </div>
          <Button size="sm" variant="ghost" className="text-primary hover:text-primary" asChild>
            <Link href="/agents">
              View all
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>

        {loading ? (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed bg-card py-16">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-violet-500/20">
              <Bot className="h-8 w-8 text-primary" />
            </div>
            <h3 className="mb-1 font-semibold">{t('noAgents')}</h3>
            <p className="mb-6 text-sm text-muted-foreground">
              Create your first agent to get started.
            </p>
            <Button asChild>
              <Link href="/agents/new">
                <PlusCircle className="mr-2 h-4 w-4" />
                {t('createFirst')}
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {agents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

function StatCard({
  title,
  value,
  icon,
  iconBg,
  trend,
}: {
  title: string;
  value: number | string | null;
  icon: React.ReactNode;
  iconBg: string;
  trend?: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground truncate pr-2">{title}</p>
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
          {icon}
        </div>
      </div>
      <div>
        {value === null ? (
          <div className="h-8 w-16 rounded-md shimmer" />
        ) : (
          <p className="text-3xl font-bold tracking-tight">{value}</p>
        )}
        {trend && (
          <p className="mt-1 text-xs text-muted-foreground">{trend}</p>
        )}
      </div>
    </div>
  );
}
