import { useTranslations } from 'next-intl';
import { ExternalLink, FileText } from 'lucide-react';
import type { SourceCitation } from '@/types';

interface SourceCitationListProps {
  sources: SourceCitation[];
}

export function SourceCitationList({ sources }: SourceCitationListProps) {
  const t = useTranslations('chat');

  if (sources.length === 0) return null;

  return (
    <div className="mt-2 space-y-1">
      <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <FileText className="h-3 w-3" />
        {t('sources')}
      </p>
      <div className="flex flex-wrap gap-1">
        {sources.map((source, index) => (
          <a
            key={index}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-xs text-secondary-foreground hover:bg-secondary/80 transition-colors"
            title={source.snippet}
          >
            <ExternalLink className="h-3 w-3" />
            <span className="max-w-[200px] truncate">{source.title}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
