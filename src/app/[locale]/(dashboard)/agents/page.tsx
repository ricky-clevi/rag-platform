'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { AgentCard } from '@/components/agent/agent-card';
import { CardSkeleton } from '@/components/common/loading-states';
import { PlusCircle, Bot, Search } from 'lucide-react';
import type { Agent } from '@/types';

export default function AgentsPage() {
  const t = useTranslations('agents');
  const dt = useTranslations('dashboard');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function fetchAgents() {
      const supabase = createClient();
      const { data } = await supabase
        .from('agents')
        .select('*')
        .order('created_at', { ascending: false });

      setAgents((data as Agent[]) || []);
      setLoading(false);
    }
    fetchAgents();
  }, []);

  const filteredAgents = agents.filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.root_url.toLowerCase().includes(search.toLowerCase())
  );

  const handleAgentDeleted = (id: string) => {
    setAgents((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <div className="space-y-6">
      {/* Hero section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
            {!loading && agents.length > 0 && (
              <span className="inline-flex h-6 items-center rounded-full bg-primary/10 px-2.5 text-xs font-semibold text-primary">
                {agents.length}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage and monitor all your AI agents in one place.
          </p>
        </div>
        <Button asChild className="shrink-0 self-start sm:self-auto">
          <Link href="/agents/new">
            <PlusCircle className="mr-2 h-4 w-4" />
            {t('new.title')}
          </Link>
        </Button>
      </div>

      {/* Search bar */}
      {!loading && agents.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search agents by name or URL..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border bg-card py-2.5 pl-9 pr-4 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/10 sm:max-w-xs"
          />
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed bg-card py-16">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-violet-500/20">
            <Bot className="h-8 w-8 text-primary" />
          </div>
          <h3 className="mb-1 font-semibold">{dt('noAgents')}</h3>
          <p className="mb-6 text-sm text-muted-foreground">
            Get started by creating your first agent.
          </p>
          <Button asChild>
            <Link href="/agents/new">
              <PlusCircle className="mr-2 h-4 w-4" />
              {dt('createFirst')}
            </Link>
          </Button>
        </div>
      ) : filteredAgents.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed bg-card py-12">
          <Search className="mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No agents match &quot;{search}&quot;
          </p>
          <button
            className="mt-2 text-xs text-primary hover:underline"
            onClick={() => setSearch('')}
          >
            Clear search
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filteredAgents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} onDelete={handleAgentDeleted} />
          ))}
        </div>
      )}
    </div>
  );
}
