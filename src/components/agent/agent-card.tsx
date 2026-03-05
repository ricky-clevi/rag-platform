'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AgentStatusBadge } from './agent-status';
import { Globe, MessageSquare, Settings, Trash2 } from 'lucide-react';
import type { Agent } from '@/types';

interface AgentCardProps {
  agent: Agent;
  onDelete?: (id: string) => void;
}

export function AgentCard({ agent, onDelete }: AgentCardProps) {
  const t = useTranslations('agents.card');
  const tCommon = useTranslations('common');

  const handleDelete = async () => {
    if (!confirm(tCommon('confirmDelete'))) return;
    await fetch(`/api/agents/${agent.id}`, { method: 'DELETE' });
    onDelete?.(agent.id);
  };

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <CardTitle className="truncate text-lg">{agent.name}</CardTitle>
            <a
              href={agent.root_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
            >
              <Globe className="h-3 w-3" />
              <span className="truncate">{agent.root_url}</span>
            </a>
          </div>
          <AgentStatusBadge status={agent.status} />
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        <p className="text-sm text-muted-foreground line-clamp-2">
          {agent.description}
        </p>
        {agent.crawl_stats?.crawled_pages && (
          <p className="mt-2 text-xs text-muted-foreground">
            {agent.crawl_stats.crawled_pages} {t('pages')}
          </p>
        )}
      </CardContent>
      <CardFooter className="gap-2">
        {agent.status === 'ready' && (
          <Button size="sm" variant="default" asChild>
            <Link href={`/agent/${agent.slug}`}>
              <MessageSquare className="mr-1 h-3 w-3" />
              {t('chat')}
            </Link>
          </Button>
        )}
        <Button size="sm" variant="outline" asChild>
          <Link href={`/agents/${agent.id}`}>
            <Settings className="mr-1 h-3 w-3" />
            {t('settings')}
          </Link>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto text-destructive hover:text-destructive"
          onClick={handleDelete}
          aria-label={`Delete ${agent.name}`}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </CardFooter>
    </Card>
  );
}
