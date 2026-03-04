'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import type { AgentStatus } from '@/types';

const statusVariantMap: Record<AgentStatus, 'default' | 'secondary' | 'success' | 'destructive' | 'warning'> = {
  pending: 'secondary',
  crawling: 'warning',
  processing: 'warning',
  ready: 'success',
  error: 'destructive',
};

export function AgentStatusBadge({ status }: { status: AgentStatus }) {
  const t = useTranslations('agents.status');

  return (
    <Badge variant={statusVariantMap[status]}>
      {status === 'crawling' && (
        <span className="mr-1 inline-block h-2 w-2 animate-pulse rounded-full bg-current" />
      )}
      {t(status)}
    </Badge>
  );
}
