'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils/cn';
import type { AgentStatus } from '@/types';

interface StatusConfig {
  containerClass: string;
  dotClass?: string;
  pulse?: boolean;
}

const statusConfigMap: Record<AgentStatus, StatusConfig> = {
  ready: {
    containerClass:
      'border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
    dotClass: 'bg-emerald-500',
  },
  crawling: {
    containerClass:
      'border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400',
    dotClass: 'bg-amber-500',
    pulse: true,
  },
  processing: {
    containerClass:
      'border-transparent bg-blue-500/15 text-blue-700 dark:text-blue-400',
    dotClass: 'bg-blue-500',
    pulse: true,
  },
  error: {
    containerClass:
      'border-transparent bg-red-500/15 text-red-700 dark:text-red-400',
    dotClass: 'bg-red-500',
  },
  pending: {
    containerClass:
      'border-transparent bg-slate-500/15 text-slate-600 dark:text-slate-400',
    dotClass: 'bg-slate-400',
  },
  draft: {
    containerClass:
      'border-transparent bg-slate-500/15 text-slate-600 dark:text-slate-400',
    dotClass: 'bg-slate-400',
  },
};

export function AgentStatusBadge({ status }: { status: AgentStatus }) {
  const t = useTranslations('agents.status');
  const config = statusConfigMap[status] ?? statusConfigMap.draft;

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold shrink-0',
        config.containerClass
      )}
    >
      {config.dotClass && (
        <span
          className={cn(
            'mr-1.5 h-2 w-2 rounded-full',
            config.dotClass,
            config.pulse && 'animate-pulse'
          )}
        />
      )}
      {t(status)}
    </div>
  );
}
