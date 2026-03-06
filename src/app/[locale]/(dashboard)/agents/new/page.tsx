'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { UrlInput } from '@/components/agent/url-input';
import { CrawlProgress } from '@/components/agent/crawl-progress';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/common/loading-states';
import { isValidUrl } from '@/lib/utils/url';
import {
  Globe,
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  Loader2,
  Monitor,
} from 'lucide-react';

interface CrawlPreview {
  url?: string;
  domain?: string;
  companyName: string;
  description: string;
  estimatedPages: number;
  hasSitemap: boolean;
  isSpa: boolean;
  estimatedMinutes: number;
  crawlAllowed: boolean;
  reachable: boolean;
  language?: string;
  error?: string;
}

export default function NewAgentPage() {
  const t = useTranslations('agents.new');
  const tCrawl = useTranslations('agents.crawl');
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [preview, setPreview] = useState<CrawlPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const handlePreview = async () => {
    if (!url) return;
    setLoadingPreview(true);
    setPreview(null);
    setError('');
    try {
      const targetUrl = url.startsWith('http') ? url : `https://${url}`;
      const res = await fetch('/api/crawl/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to preview URL');
        return;
      }
      setPreview(data);
      if (data.companyName && !name) {
        setName(data.companyName);
      }
    } catch {
      setError('Failed to preview URL');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const targetUrl = url.startsWith('http') ? url : `https://${url}`;

    if (!isValidUrl(targetUrl)) {
      setError(t('invalidUrl'));
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          root_url: targetUrl,
          name: name || undefined,
          description: description || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to create agent');
        setLoading(false);
        return;
      }

      setAgentId(data.agent.id);
    } catch {
      setError('Failed to create agent. Please try again.');
      setLoading(false);
    }
  };

  if (agentId) {
    return (
      <div className="mx-auto max-w-2xl">
        <CrawlProgress
          agentId={agentId}
          onComplete={() => router.push(`/agents/${agentId}`)}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('subtitle')}</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-6">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="url">{t('urlLabel')}</Label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <UrlInput
                    value={url}
                    onChange={(val) => {
                      setUrl(val);
                      // Clear preview when URL changes
                      if (preview) setPreview(null);
                    }}
                    onSubmit={handleSubmit}
                    placeholder={t('urlPlaceholder')}
                    disabled={loading || loadingPreview}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePreview}
                  disabled={!url || loading || loadingPreview}
                  className="shrink-0"
                >
                  {loadingPreview ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="mr-2 h-4 w-4" />
                  )}
                  {loadingPreview ? t('previewLoading') : t('previewButton')}
                </Button>
              </div>
            </div>

            {/* Preview card */}
            {preview && (
              <Card className="border-primary/20 bg-primary/5">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Globe className="h-4 w-4" />
                    {t('previewTitle')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {!preview.reachable && (
                    <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-2.5 text-sm text-destructive">
                      <XCircle className="h-4 w-4 shrink-0" />
                      {t('notReachable')}
                    </div>
                  )}

                  {preview.reachable && (
                    <>
                      {/* Company info */}
                      <div>
                        <div className="text-lg font-semibold">{preview.companyName}</div>
                        {preview.description && (
                          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                            {preview.description}
                          </p>
                        )}
                      </div>

                      {/* Stats grid */}
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="flex items-center gap-2 rounded-md border bg-background p-2.5">
                          <FileText className="h-4 w-4 text-primary" />
                          <div>
                            <div className="font-medium">{preview.estimatedPages}</div>
                            <div className="text-xs text-muted-foreground">{t('estimatedPages')}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 rounded-md border bg-background p-2.5">
                          <Clock className="h-4 w-4 text-primary" />
                          <div>
                            <div className="font-medium">~{preview.estimatedMinutes} {t('minutes')}</div>
                            <div className="text-xs text-muted-foreground">{t('estimatedTime')}</div>
                          </div>
                        </div>
                      </div>

                      {/* Badges */}
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={preview.hasSitemap ? 'success' : 'secondary'}>
                          {preview.hasSitemap ? (
                            <CheckCircle2 className="mr-1 h-3 w-3" />
                          ) : (
                            <XCircle className="mr-1 h-3 w-3" />
                          )}
                          {t('hasSitemap')}
                        </Badge>
                        {preview.isSpa && (
                          <Badge variant="warning">
                            <Monitor className="mr-1 h-3 w-3" />
                            {t('isSpa')}
                          </Badge>
                        )}
                        <Badge variant={preview.crawlAllowed ? 'success' : 'destructive'}>
                          {preview.crawlAllowed ? (
                            <CheckCircle2 className="mr-1 h-3 w-3" />
                          ) : (
                            <AlertTriangle className="mr-1 h-3 w-3" />
                          )}
                          {t('crawlAllowed')}
                        </Badge>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">{t('nameLabel')}</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('namePlaceholder')}
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{t('descriptionLabel')}</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('descriptionPlaceholder')}
                disabled={loading}
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading || !url}>
              {loading ? (
                <>
                  <Spinner className="mr-2" />
                  {t('crawling')}
                </>
              ) : (
                t('crawlButton')
              )}
            </Button>
          </CardContent>
        </form>
      </Card>
    </div>
  );
}
