import { useState } from 'react';
import { Bot, User, AlertTriangle, ThumbsUp, ThumbsDown } from 'lucide-react';
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
  answered_from_sources_only?: boolean;
}

export function MessageBubble({
  role,
  content,
  sources,
  isStreaming,
  confidence,
  model_used,
  answered_from_sources_only,
}: MessageBubbleProps) {
  const [feedback, setFeedback] = useState<'positive' | 'negative' | null>(null);
  const isUser = role === 'user';
  const isLowConfidence = confidence !== undefined && confidence < 0.4;
  const usedGeneralKnowledge = answered_from_sources_only === false;

  const handleFeedback = (type: 'positive' | 'negative') => {
    setFeedback(prev => (prev === type ? null : type));
  };

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
        {/* Low confidence warning (#19) */}
        {!isUser && !isStreaming && isLowConfidence && (
          <div className="flex items-center gap-1.5 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-1.5 text-xs text-yellow-800">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span>This answer may be incomplete. The information was not strongly supported by the company&apos;s website.</span>
          </div>
        )}

        {/* General knowledge warning (#19) */}
        {!isUser && !isStreaming && usedGeneralKnowledge && !isLowConfidence && (
          <div className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs text-blue-800">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span>This answer includes information beyond the company&apos;s website content.</span>
          </div>
        )}

        <div
          className={cn(
            'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
            isUser
              ? 'bg-primary text-primary-foreground rounded-br-md'
              : isLowConfidence
                ? 'bg-yellow-50 border border-yellow-200 rounded-bl-md'
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

        {/* Feedback buttons */}
        {role === 'assistant' && !isStreaming && (
          <div className="mt-2 flex items-center gap-1">
            <button
              onClick={() => handleFeedback('positive')}
              className={`rounded p-1 transition-colors hover:bg-muted ${feedback === 'positive' ? 'text-green-500' : 'text-muted-foreground'}`}
              title="Helpful"
            >
              <ThumbsUp className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => handleFeedback('negative')}
              className={`rounded p-1 transition-colors hover:bg-muted ${feedback === 'negative' ? 'text-red-500' : 'text-muted-foreground'}`}
              title="Not helpful"
            >
              <ThumbsDown className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
