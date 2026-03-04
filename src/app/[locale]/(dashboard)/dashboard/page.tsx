'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AgentCard } from '@/components/agent/agent-card';
import { CardSkeleton } from '@/components/common/loading-states';
import { Bot, FileText, MessageSquare, PlusCircle } from 'lucide-react';
import type { Agent } from '@/types';

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground">{t('welcome')}</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title={t('stats.totalAgents')}
          value={agents.length}
          icon={<Bot className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title={t('stats.activeAgents')}
          value={readyAgents.length}
          icon={<FileText className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title={t('stats.totalConversations')}
          value="-"
          icon={<MessageSquare className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      {/* Recent Agents */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">{t('recentAgents')}</h2>
          <Button size="sm" asChild>
            <Link href="/agents/new">
              <PlusCircle className="mr-2 h-4 w-4" />
              {t('createFirst')}
            </Link>
          </Button>
        </div>

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : agents.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Bot className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="mb-4 text-muted-foreground">{t('noAgents')}</p>
              <Button asChild>
                <Link href="/agents/new">
                  <PlusCircle className="mr-2 h-4 w-4" />
                  {t('createFirst')}
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {agents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: number | string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
