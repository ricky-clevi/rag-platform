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
import { Spinner } from '@/components/common/loading-states';
import { isValidUrl } from '@/lib/utils/url';

export default function NewAgentPage() {
  const t = useTranslations('agents.new');
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [agentId, setAgentId] = useState<string | null>(null);

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
              <UrlInput
                value={url}
                onChange={setUrl}
                onSubmit={handleSubmit}
                placeholder={t('urlPlaceholder')}
                disabled={loading}
              />
            </div>

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
