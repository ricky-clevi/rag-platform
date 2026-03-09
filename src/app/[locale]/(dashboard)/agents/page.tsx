'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { AgentCard } from '@/components/agent/agent-card';
import { CardSkeleton } from '@/components/common/loading-states';
import { Input } from '@/components/ui/input';
import { Bot, PlusCircle, Search } from 'lucide-react';
import type { Agent } from '@/types';

export default function AgentsPage() {
  const t = useTranslations('agents.index');
  const supabase = useMemo(() => createClient(), []);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

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

      setAgents((data as Agent[]) || []);
      setLoading(false);
    }

    fetchAgents();

    return () => {
      active = false;
    };
  }, [supabase]);

  const filteredAgents = agents.filter((agent) => {
    const needle = query.toLowerCase();
    return (
      agent.name.toLowerCase().includes(needle)
      || agent.root_url.toLowerCase().includes(needle)
    );
  });

  const handleAgentDeleted = (id: string) => {
    setAgents((current) => current.filter((agent) => agent.id !== id));
  };

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
          <Button asChild>
            <Link href="/agents/new">
              <PlusCircle className="h-4 w-4" />
              {t('cta')}
            </Link>
          </Button>
        </div>
      </section>

      {!loading && agents.length > 0 ? (
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('searchPlaceholder')}
            className="pl-11"
          />
        </div>
      ) : null}

      {loading ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <CardSkeleton key={index} />
          ))}
        </div>
      ) : agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[2rem] border border-dashed bg-surface-glass px-6 py-16 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-secondary text-secondary-foreground">
            <Bot className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-semibold">{t('emptyTitle')}</h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
            {t('emptySubtitle')}
          </p>
          <Button className="mt-6" asChild>
            <Link href="/agents/new">{t('emptyCta')}</Link>
          </Button>
        </div>
      ) : filteredAgents.length === 0 ? (
        <div className="rounded-[2rem] border border-dashed bg-surface-glass px-6 py-14 text-center">
          <p className="text-base font-medium">{t('noMatches', { query })}</p>
          <button
            type="button"
            onClick={() => setQuery('')}
            className="mt-3 text-sm text-primary underline decoration-transparent underline-offset-4 transition-[color,decoration-color] hover:decoration-current"
          >
            {t('clearSearch')}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredAgents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} onDelete={handleAgentDeleted} />
          ))}
        </div>
      )}
    </div>
  );
}
