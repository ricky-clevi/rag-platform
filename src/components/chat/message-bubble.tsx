import { Bot, User } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { CitationDrawer } from './citation-drawer';
import { ConfidenceBadge } from './confidence-badge';
import { Spinner } from '@/components/common/loading-states';
import type { SourceCitation } from '@/types';

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  sources?: SourceCitation[];
  isStreaming?: boolean;
  confidence?: number;
  model_used?: string;
}

export function MessageBubble({
  role,
  content,
  sources,
  isStreaming,
  confidence,
  model_used,
}: MessageBubbleProps) {
  const isUser = role === 'user';

  return (
    <div className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-secondary' : 'bg-primary text-primary-foreground'
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div
        className={cn(
          'max-w-[80%] space-y-2',
          isUser && 'flex flex-col items-end'
        )}
      >
        <div
          className={cn(
            'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
            isUser
              ? 'bg-primary text-primary-foreground rounded-br-md'
              : 'bg-muted rounded-bl-md'
          )}
        >
          {content || (isStreaming && <Spinner className="h-4 w-4" />)}
          {isStreaming && content && (
            <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-current" />
          )}
        </div>

        {/* Confidence badge + model info */}
        {!isUser && !isStreaming && confidence !== undefined && (
          <ConfidenceBadge confidence={confidence} model_used={model_used} />
        )}

        {/* Citation Drawer */}
        {sources && sources.length > 0 && !isStreaming && (
          <CitationDrawer sources={sources} />
        )}
      </div>
    </div>
  );
}
