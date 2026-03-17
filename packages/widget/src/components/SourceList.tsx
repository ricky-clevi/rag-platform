import React, { useState } from 'react';
import type { SourceCitation } from '../types';

interface SourceListProps {
  sources: SourceCitation[];
}

export function SourceList({ sources }: SourceListProps) {
  const [expanded, setExpanded] = useState(false);

  if (sources.length === 0) return null;

  return (
    <div className="af-sources">
      <button
        className="af-sources-toggle"
        onClick={() => setExpanded(!expanded)}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d={expanded ? 'M9 7.5L6 4.5L3 7.5' : 'M3 4.5L6 7.5L9 4.5'} />
        </svg>
        {sources.length} source{sources.length !== 1 ? 's' : ''}
      </button>
      {expanded && (
        <div className="af-sources-list">
          {sources.map((source, i) => (
            <a
              key={`${source.url}-${i}`}
              className="af-source-item"
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="af-source-title">{source.title}</span>
              {source.snippet && (
                <span className="af-source-snippet">{source.snippet}</span>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
