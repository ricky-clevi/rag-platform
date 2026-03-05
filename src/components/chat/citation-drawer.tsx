'use client';

import { useState } from 'react';
import { ExternalLink, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import type { SourceCitation } from '@/types';

interface CitationDrawerProps {
  sources: SourceCitation[];
}

export function CitationDrawer({ sources }: CitationDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (sources.length === 0) return null;

  return (
    <div className="w-full rounded-lg border border-border bg-card shadow-sm">
      {/* Header / Toggle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-label={`${sources.length} source${sources.length !== 1 ? 's' : ''}`}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <FileText className="h-3 w-3" />
          {sources.length} source{sources.length !== 1 ? 's' : ''}
        </span>
        {isOpen ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )}
      </button>

      {/* Collapsed: show compact source badges */}
      {!isOpen && (
        <div className="flex flex-wrap gap-1 px-3 pb-2">
          {sources.slice(0, 3).map((source, index) => (
            <a
              key={index}
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground hover:bg-secondary/80 transition-colors"
            >
              <ExternalLink className="h-2.5 w-2.5" />
              <span className="max-w-[150px] truncate">{source.title || source.url}</span>
            </a>
          ))}
          {sources.length > 3 && (
            <span className="inline-flex items-center px-2 py-0.5 text-xs text-muted-foreground">
              +{sources.length - 3} more
            </span>
          )}
        </div>
      )}

      {/* Expanded: show full citation details */}
      {isOpen && (
        <div className="border-t border-border">
          <div className="max-h-64 overflow-y-auto">
            {sources.map((source, index) => (
              <div
                key={index}
                className="border-b border-border/50 px-3 py-2.5 last:border-b-0 hover:bg-accent/50 transition-colors"
              >
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group"
                >
                  <div className="flex items-start gap-2">
                    <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground group-hover:text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground group-hover:text-primary truncate">
                        {source.title || source.url}
                      </p>
                      {source.heading_path && (
                        <p className="mt-0.5 text-xs text-muted-foreground truncate">
                          {source.heading_path}
                        </p>
                      )}
                      {source.snippet && (
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                          {source.snippet}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground/60 truncate">
                        {source.url}
                      </p>
                    </div>
                  </div>
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
