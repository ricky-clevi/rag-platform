'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, FileText, ExternalLink, ChevronRight, Globe, Loader2 } from 'lucide-react';

interface CrawledPage {
  id: string;
  url: string;
  title: string | null;
  crawl_status: string;
  language: string;
  last_crawled_at: string;
  chunk_count?: number;
  clean_markdown?: string;
}

interface SearchResult {
  content: string;
  heading_path: string;
  page_url: string;
  similarity: number;
}

export default function KnowledgePage() {
  const { id: agentId } = useParams<{ id: string }>();
  const t = useTranslations('agents.knowledge');
  const [pages, setPages] = useState<CrawledPage[]>([]);
  const [selectedPage, setSelectedPage] = useState<CrawledPage | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    let active = true;

    async function fetchPages() {
      setLoading(true);
      try {
        const res = await fetch(`/api/agents/${agentId}/pages?limit=500`);
        if (!res.ok || !active) return;
        const data = await res.json();
        if (active) {
          setPages(data.pages || []);
        }
      } catch {
        /* ignore */
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void fetchPages();
    return () => {
      active = false;
    };
  }, [agentId]);

  // Search across knowledge base
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    setSearchLoading(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/knowledge?search=${encodeURIComponent(searchQuery)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
      }
    } catch {
      /* ignore */
    }
    setSearchLoading(false);
  };

  // Stats
  const totalPages = pages.length;
  const crawledPages = pages.filter(p => p.crawl_status === 'crawled').length;
  const failedPages = pages.filter(p => p.crawl_status === 'failed').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{crawledPages}</div>
            <div className="text-sm text-muted-foreground">{t('crawledPages')}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{totalPages}</div>
            <div className="text-sm text-muted-foreground">{t('totalPages')}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-destructive">{failedPages}</div>
            <div className="text-sm text-muted-foreground">{t('failedPages')}</div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="pl-10"
          />
        </div>
        <Button onClick={handleSearch} disabled={searchLoading}>
          {searchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : t('searchButton')}
        </Button>
      </div>

      {/* Search Results */}
      {searchResults && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('searchResults', { count: searchResults.length })}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {searchResults.map((result, i) => (
                <div key={i} className="rounded-lg border p-3">
                  <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <Globe className="h-3 w-3" />
                    <span className="truncate">{result.page_url}</span>
                    {result.heading_path && (
                      <>
                        <ChevronRight className="h-3 w-3" />
                        <span>{result.heading_path}</span>
                      </>
                    )}
                  </div>
                  <p className="text-sm">{result.content.slice(0, 300)}...</p>
                  <Badge variant="outline" className="mt-2">
                    {Math.round(result.similarity * 100)}% match
                  </Badge>
                </div>
              ))}
              {searchResults.length === 0 && (
                <p className="text-center text-muted-foreground">{t('noResults')}</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Page Browser */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Page List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('pageList')}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[500px]">
              {loading ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <div className="divide-y">
                  {pages.filter(p => p.crawl_status === 'crawled').map((page) => (
                    <button
                      key={page.id}
                      onClick={() => setSelectedPage(page)}
                      className={`w-full px-4 py-3 text-left transition-colors hover:bg-muted/50 ${
                        selectedPage?.id === page.id ? 'bg-muted' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">
                            {page.title || new URL(page.url).pathname}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">{page.url}</div>
                        </div>
                        <Badge variant={page.crawl_status === 'crawled' ? 'default' : 'destructive'} className="shrink-0">
                          {page.crawl_status}
                        </Badge>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Page Content Preview */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                {selectedPage ? (selectedPage.title || 'Page Content') : t('selectPage')}
              </CardTitle>
              {selectedPage && (
                <a
                  href={selectedPage.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[500px] p-4">
              {selectedPage ? (
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <pre className="whitespace-pre-wrap text-sm">
                    {selectedPage.clean_markdown || 'No content available'}
                  </pre>
                </div>
              ) : (
                <p className="text-center text-muted-foreground">{t('selectPageHint')}</p>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
