'use client';

import { useState, useEffect, use } from 'react';
import { FileText, Plus, Minus, Equal, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface PageInfo {
  id: string;
  url: string;
  title: string;
  crawl_status: string;
}

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  line: string;
}

interface DiffResult {
  page: { id: string; url: string; title: string; last_crawled_at: string };
  has_previous: boolean;
  diff: DiffLine[];
  stats: { added: number; removed: number; unchanged: number };
}

export default function DiffPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDiff, setLoadingDiff] = useState(false);

  useEffect(() => {
    fetchPages();
  }, [id]);

  async function fetchPages() {
    try {
      const res = await fetch(`/api/agents/${id}/pages?status=crawled`);
      if (!res.ok) throw new Error('Failed to load pages');
      const data = await res.json();
      setPages(data.pages || []);
    } catch (err) {
      console.error('Failed to fetch pages:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadDiff(pageId: string) {
    setSelectedPageId(pageId);
    setLoadingDiff(true);
    setDiffResult(null);
    try {
      const res = await fetch(`/api/agents/${id}/diff?page_id=${pageId}`);
      if (!res.ok) throw new Error('Failed to load diff');
      const data = await res.json();
      setDiffResult(data);
    } catch (err) {
      console.error('Failed to load diff:', err);
    } finally {
      setLoadingDiff(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Content Diff</h1>
        <p className="text-sm text-muted-foreground">
          Compare page content between crawls to see what changed
        </p>
      </div>

      {/* Page selector */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Select a page to view diff</label>
        <div className="relative">
          <select
            value={selectedPageId || ''}
            onChange={(e) => e.target.value && loadDiff(e.target.value)}
            className="w-full appearance-none rounded-lg border bg-background px-4 py-2.5 pr-10 text-sm"
          >
            <option value="">Choose a page...</option>
            {pages.map((page) => (
              <option key={page.id} value={page.id}>
                {page.title || page.url}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
        </div>
      </div>

      {/* Diff content */}
      {loadingDiff && (
        <div className="flex items-center justify-center p-8">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      )}

      {diffResult && !loadingDiff && (
        <div className="space-y-4">
          {/* Page info */}
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">{diffResult.page.title || diffResult.page.url}</p>
                <p className="text-xs text-muted-foreground">{diffResult.page.url}</p>
                <p className="text-xs text-muted-foreground">
                  Last crawled: {new Date(diffResult.page.last_crawled_at).toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="flex gap-4 text-sm">
            <span className="flex items-center gap-1 text-green-600">
              <Plus className="h-3.5 w-3.5" /> {diffResult.stats.added} added
            </span>
            <span className="flex items-center gap-1 text-red-600">
              <Minus className="h-3.5 w-3.5" /> {diffResult.stats.removed} removed
            </span>
            <span className="flex items-center gap-1 text-muted-foreground">
              <Equal className="h-3.5 w-3.5" /> {diffResult.stats.unchanged} unchanged
            </span>
          </div>

          {!diffResult.has_previous ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No previous version available for comparison. A diff will be available after the next recrawl.
            </div>
          ) : diffResult.diff.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No changes detected between crawls.
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <div className="max-h-[600px] overflow-auto">
                <pre className="text-xs leading-relaxed">
                  {diffResult.diff.map((line, i) => (
                    <div
                      key={i}
                      className={cn(
                        'px-4 py-0.5',
                        line.type === 'added' && 'bg-green-50 text-green-800',
                        line.type === 'removed' && 'bg-red-50 text-red-800',
                        line.type === 'unchanged' && 'text-muted-foreground'
                      )}
                    >
                      <span className="mr-2 inline-block w-4 select-none text-right opacity-50">
                        {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                      </span>
                      {line.line}
                    </div>
                  ))}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
