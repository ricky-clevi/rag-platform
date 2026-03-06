'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { AgentStatusBadge } from './agent-status';
import { Globe, MessageSquare, Settings, Trash2, FileText, Database } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { Agent } from '@/types';

interface AgentCardProps {
  agent: Agent;
  onDelete?: (id: string) => void;
}

function AgentFavicon({ url, name }: { url: string; name: string }) {
  const [failed, setFailed] = useState(false);
  let domain = '';
  try {
    domain = new URL(url).hostname;
  } catch {}

  if (failed || !domain) {
    return (
      <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-violet-500 flex items-center justify-center text-white font-bold text-lg shrink-0">
        {name[0]?.toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
      alt=""
      width={40}
      height={40}
      className="h-10 w-10 rounded-xl object-contain border border-border bg-muted shrink-0"
      onError={() => setFailed(true)}
    />
  );
}

export function AgentCard({ agent, onDelete }: AgentCardProps) {
  const t = useTranslations('agents.card');
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleted, setDeleted] = useState(false);

  if (deleted) {
    return null;
  }

  const handleDelete = async () => {
    if (!confirmDelete) {
      setDeleteError('');
      setConfirmDelete(true);
      return;
    }

    setDeleting(true);
    setDeleteError('');

    try {
      const response = await fetch(`/api/agents/${agent.id}`, { method: 'DELETE' });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setDeleteError(payload?.error || 'Delete failed. Please try again.');
        setDeleting(false);
        return;
      }

      setDeleted(true);
      onDelete?.(agent.id);
      router.refresh();
    } catch {
      setDeleteError('Delete failed. Please try again.');
      setDeleting(false);
    }
  };

  return (
    <div
      className={cn(
        'group relative flex flex-col rounded-2xl border bg-card p-5 transition-all duration-200',
        'hover:shadow-xl hover:shadow-primary/10 hover:-translate-y-0.5 hover:border-primary/30',
        confirmDelete && 'border-destructive/40 bg-destructive/5'
      )}
    >
      {/* Card header */}
      <div className="mb-3 flex items-start gap-3">
        <AgentFavicon url={agent.root_url} name={agent.name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold leading-snug truncate">{agent.name}</h3>
            <AgentStatusBadge status={agent.status} />
          </div>
          <a
            href={agent.root_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <Globe className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate max-w-[140px]">
              {agent.root_url.replace(/^https?:\/\//, '')}
            </span>
          </a>
        </div>
      </div>

      {/* Description */}
      {agent.description && (
        <p className="mb-3 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
          {agent.description}
        </p>
      )}

      {/* Stats pills */}
      {agent.crawl_stats && (
        <div className="mb-4 flex flex-wrap gap-2">
          {agent.crawl_stats.crawled_pages != null && (
            <div className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
              <FileText className="h-3 w-3" />
              {agent.crawl_stats.crawled_pages} {t('pages')}
            </div>
          )}
          {agent.crawl_stats.total_chunks != null && (
            <div className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
              <Database className="h-3 w-3" />
              {agent.crawl_stats.total_chunks} {t('chunks')}
            </div>
          )}
        </div>
      )}

      {/* Inline delete confirmation */}
      {confirmDelete && (
        <div className="mb-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
          {t('confirmDelete', { name: agent.name })}
        </div>
      )}

      {deleteError && (
        <div
          className="mb-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs text-destructive"
          aria-live="polite"
        >
          {deleteError}
        </div>
      )}

      {/* Actions */}
      <div className="mt-auto flex items-center gap-2">
        {agent.status === 'ready' && (
          <Button size="sm" className="h-8 px-3 text-xs flex-1" asChild>
            <Link href={`/agent/${agent.slug}`}>
              <MessageSquare className="mr-1.5 h-3 w-3" />
              {t('chat')}
            </Link>
          </Button>
        )}
        <Button size="sm" variant="outline" className="h-8 px-3 text-xs" asChild>
          <Link href={`/agents/${agent.id}`}>
            <Settings className="mr-1.5 h-3 w-3" />
            {t('settings')}
          </Link>
        </Button>
        <Button
          size="sm"
          variant={confirmDelete ? 'destructive' : 'ghost'}
          className={cn(
            'h-8 px-2.5',
            !confirmDelete && 'ml-auto text-muted-foreground hover:text-destructive'
          )}
          onClick={handleDelete}
          disabled={deleting}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {confirmDelete && <span className="ml-1 text-xs">{t('confirm')}</span>}
        </Button>
        {confirmDelete && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs"
            onClick={() => setConfirmDelete(false)}
          >
            {t('cancel')}
          </Button>
        )}
      </div>
    </div>
  );
}
