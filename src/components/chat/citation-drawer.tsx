'use client';

import { useState } from 'react';
import { ExternalLink, ChevronDown, ChevronUp, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { SourceCitation } from '@/types';

interface CitationDrawerProps {
  sources: SourceCitation[];
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function getFaviconUrl(url: string): string {
  try {
    const origin = new URL(url).origin;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(origin)}&sz=32`;
  } catch {
    return '';
  }
}

export function CitationDrawer({ sources }: CitationDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (sources.length === 0) return null;

  return (
    <div className="w-full overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {/* Toggle header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between px-3 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <BookOpen className="h-3.5 w-3.5 text-primary/70" />
          <span>
            {sources.length} source{sources.length !== 1 ? 's' : ''}
          </span>

          {/* Inline favicon previews when collapsed */}
          {!isOpen && (
            <span className="ml-1.5 flex items-center gap-0.5">
              {sources.slice(0, 4).map((source, i) => {
                const faviconUrl = getFaviconUrl(source.url);
                return faviconUrl ? (
                  <img
                    key={i}
                    src={faviconUrl}
                    alt=""
                    width={12}
                    height={12}
                    className="h-3 w-3 rounded-sm opacity-70"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : null;
              })}
            </span>
          )}
        </span>
        {isOpen ? (
          <ChevronUp className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )}
      </button>

      {/* Expandable source list */}
      {isOpen && (
        <div className="border-t border-border divide-y divide-border/50">
          {sources.map((source, index) => {
            const domain = getDomain(source.url);
            const faviconUrl = getFaviconUrl(source.url);

            return (
              <a
                key={index}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'group flex items-start gap-3 px-3 py-3 transition-colors hover:bg-accent/40',
                  index === sources.length - 1 && 'rounded-b-xl'
                )}
              >
                {/* Favicon */}
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted">
                  {faviconUrl ? (
                    <img
                      src={faviconUrl}
                      alt={domain}
                      width={16}
                      height={16}
                      className="h-4 w-4 rounded-sm"
                      onError={(e) => {
                        const el = e.target as HTMLImageElement;
                        el.style.display = 'none';
                        const parent = el.parentElement;
                        if (parent) {
                          parent.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
                        }
                      }}
                    />
                  ) : (
                    <ExternalLink className="h-3 w-3 text-muted-foreground" />
                  )}
                </div>

                {/* Text content */}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground group-hover:text-primary truncate leading-tight transition-colors">
                    {source.title || domain}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground/70 truncate leading-tight">
                    {domain}
                  </p>
                  {source.heading_path && (
                    <p className="mt-0.5 text-[11px] text-muted-foreground truncate leading-tight">
                      {source.heading_path}
                    </p>
                  )}
                  {source.snippet && (
                    <p className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                      {source.snippet}
                    </p>
                  )}
                </div>

                {/* External link indicator */}
                <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground/40 group-hover:text-primary/60 transition-colors" />
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
