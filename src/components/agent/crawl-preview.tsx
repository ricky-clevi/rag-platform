'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatNumber } from '@/lib/utils/format';

interface CrawlPreviewProps {
  preview: {
    hostname: string;
    totalUrls: number;
    urls: string[];
    hasSitemap: boolean;
    crawlAllowed: boolean;
    likelySpa: boolean;
    pathGroups?: Array<{
      prefix: string;
      count: number;
      samples: string[];
    }>;
  };
  ignoreRobots: boolean;
  onBack: () => void;
  onNext: () => void;
}

function Stat({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-[1.3rem] border border-border/70 bg-surface-glass p-4">
      <p className="text-sm text-muted-foreground">{title}</p>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

export function CrawlPreviewCard({
  preview,
  ignoreRobots,
  onBack,
  onNext,
}: CrawlPreviewProps) {
  const t = useTranslations('agents.newFlow');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('steps.preflight')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-4">
          <Stat title={t('preflight.urls')} value={formatNumber(preview.totalUrls ?? preview.urls?.length ?? 0)} />
          <Stat title={t('preflight.hostname')} value={preview.hostname} />
          <Stat title={t('preflight.rendering')} value={preview.likelySpa ? 'SPA' : 'HTML'} />
          <Stat title={t('preflight.groupedPaths')} value={formatNumber(preview.pathGroups?.length || 0)} />
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant={preview.hasSitemap ? 'success' : 'outline'}>
            {preview.hasSitemap ? t('preflight.sitemapFound') : t('preflight.noSitemap')}
          </Badge>
          <Badge variant={preview.crawlAllowed || ignoreRobots ? 'success' : 'destructive'}>
            {preview.crawlAllowed
              ? t('preflight.crawlAllowed')
              : ignoreRobots
                ? t('preflight.robotsOverridden')
                : t('preflight.crawlBlocked')}
          </Badge>
        </div>

        {preview.pathGroups?.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {preview.pathGroups.slice(0, 6).map((group) => (
              <div
                key={group.prefix}
                className="rounded-[1.3rem] border border-border/70 bg-surface-glass p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold">{group.prefix}</p>
                  <Badge variant="outline">{formatNumber(group.count)}</Badge>
                </div>
                <div className="mt-3 space-y-1">
                  {group.samples.map((sample) => (
                    <p key={sample} className="truncate text-xs text-muted-foreground">
                      {sample}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="max-h-56 space-y-2 overflow-auto pr-1">
          {(preview.urls ?? []).slice(0, 10).map((entry) => (
            <div
              key={entry}
              className="rounded-2xl border border-border/70 px-3 py-2 text-xs text-muted-foreground"
            >
              {entry}
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack}>
            {t('actions.back')}
          </Button>
          <Button onClick={onNext}>{t('actions.next')}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
