'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
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
    const hostname = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=32`;
  } catch {
    return '';
  }
}

export function CitationDrawer({ sources }: CitationDrawerProps) {
  const t = useTranslations('chat');
  const [isOpen, setIsOpen] = useState(false);

  if (sources.length === 0) return null;

  return (
    <div className="w-full overflow-hidden rounded-[1.25rem] border border-border bg-card shadow-sm">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between px-4 py-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
      >
        <span className="flex items-center gap-2">
          <BookOpen className="h-3.5 w-3.5 text-primary/70" />
          <span>{t('sourcesCount', { count: sources.length })}</span>
          {!isOpen ? (
            <span className="ml-1.5 flex items-center gap-1">
              {sources.slice(0, 4).map((source, idx) => {
                const faviconUrl = getFaviconUrl(source.url);
                return faviconUrl ? (
                  <img
                    key={`${source.url}-${idx}`}
                    src={faviconUrl}
                    alt=""
                    width={12}
                    height={12}
                    className="h-3 w-3 rounded-sm opacity-70"
                  />
                ) : null;
              })}
            </span>
          ) : null}
        </span>
        {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {isOpen ? (
        <div className="divide-y divide-border/50 border-t border-border">
          {sources.map((source, index) => {
            const domain = getDomain(source.url);
            const faviconUrl = getFaviconUrl(source.url);

            return (
              <a
                key={`${source.url}-${index}`}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'group flex items-start gap-3 px-4 py-4 transition-colors hover:bg-accent/40',
                  index === sources.length - 1 && 'rounded-b-[1.25rem]'
                )}
              >
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted">
                  {faviconUrl ? (
                    <img
                      src={faviconUrl}
                      alt=""
                      width={16}
                      height={16}
                      className="h-4 w-4 rounded-sm"
                    />
                  ) : (
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground transition-colors group-hover:text-primary">
                    {source.title || domain}
                  </p>
                  <p className="mt-1 truncate text-[11px] text-muted-foreground/70">{domain}</p>
                  {source.heading_path ? (
                    <p className="mt-1 truncate text-[11px] text-muted-foreground">
                      {source.heading_path}
                    </p>
                  ) : null}
                  {source.snippet ? (
                    <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                      {source.snippet}
                    </p>
                  ) : null}
                </div>

                <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-primary/60" />
              </a>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
