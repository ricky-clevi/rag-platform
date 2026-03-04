'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/common/loading-states';
import { CheckCircle, XCircle, Globe, FileText } from 'lucide-react';
import type { AgentStatus, CrawlStats } from '@/types';

interface CrawlProgressProps {
  agentId: string;
  onComplete: () => void;
}

export function CrawlProgress({ agentId, onComplete }: CrawlProgressProps) {
  const t = useTranslations('agents');
  const [status, setStatus] = useState<AgentStatus>('pending');
  const [stats, setStats] = useState<CrawlStats>({});
  const [agentName, setAgentName] = useState('');

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/crawl/status?agent_id=${agentId}`);
        if (response.ok) {
          const data = await response.json();
          setStatus(data.status);
          setStats(data.crawl_stats || {});
          setAgentName(data.name);

          if (data.status === 'ready' || data.status === 'error') {
            clearInterval(interval);
          }
        }
      } catch {
        // ignore polling errors
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [agentId]);

  const isActive = status === 'crawling' || status === 'processing' || status === 'pending';
  const isReady = status === 'ready';
  const isError = status === 'error';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {isActive && <Spinner className="h-5 w-5" />}
          {isReady && <CheckCircle className="h-5 w-5 text-green-500" />}
          {isError && <XCircle className="h-5 w-5 text-destructive" />}
          {agentName || 'Agent'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Badge variant={isReady ? 'success' : isError ? 'destructive' : 'warning'}>
            {t(`status.${status}`)}
          </Badge>
        </div>

        {isActive && (
          <Progress value={stats.crawled_pages ? Math.min((stats.crawled_pages / Math.max(stats.total_pages || 10, 1)) * 100, 95) : 10} />
        )}

        {isReady && <Progress value={100} />}

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Globe className="h-4 w-4" />
            <span>{stats.crawled_pages || 0} pages crawled</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <FileText className="h-4 w-4" />
            <span>{stats.total_chunks || 0} chunks created</span>
          </div>
        </div>

        {isReady && (
          <Button className="w-full" onClick={onComplete}>
            View Agent
          </Button>
        )}

        {isError && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            Crawling failed. Please try again.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
