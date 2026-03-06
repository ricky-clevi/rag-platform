'use client';

import { useState } from 'react';
import { Bot, User, AlertTriangle, ThumbsUp, ThumbsDown, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { CitationDrawer } from './citation-drawer';
import { ConfidenceBadge } from './confidence-badge';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
  const [copied, setCopied] = useState(false);
  const isUser = role === 'user';
  const isLowConfidence = confidence !== undefined && confidence < 0.4;
  const usedGeneralKnowledge = answered_from_sources_only === false;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFeedback = (type: 'positive' | 'negative') => {
    setFeedback(prev => (prev === type ? null : type));
  };

  return (
    <div className={cn('group flex gap-3', isUser && 'flex-row-reverse')}>
      {/* Avatar */}
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium',
          isUser
            ? 'bg-gradient-to-br from-violet-500 to-indigo-500 text-white'
            : 'bg-primary/10 text-primary border border-primary/20'
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      <div className={cn('max-w-[82%] space-y-1.5', isUser && 'flex flex-col items-end')}>
        {/* Warnings */}
        {!isUser && !isStreaming && isLowConfidence && (
          <div className="flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span>Low confidence — information may be incomplete.</span>
          </div>
        )}
        {!isUser && !isStreaming && usedGeneralKnowledge && !isLowConfidence && (
          <div className="flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span>Includes information beyond the indexed content.</span>
          </div>
        )}

        {/* Message bubble */}
        <div
          className={cn(
            'rounded-2xl px-4 py-3 text-sm leading-relaxed',
            isUser
              ? 'bg-primary text-primary-foreground rounded-br-sm'
              : 'bg-card border border-border rounded-bl-sm shadow-sm'
          )}
        >
          {isStreaming && !content ? (
            /* Typing animation */
            <div className="flex items-center gap-1 py-1">
              <span className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.3s]" />
              <span className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.15s]" />
              <span className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce" />
            </div>
          ) : isUser ? (
            <span className="whitespace-pre-wrap">{content}</span>
          ) : (
            /* Markdown rendering for assistant messages */
            <div className="[&>p]:my-2 [&>p]:leading-relaxed [&>h1]:text-xl [&>h1]:font-bold [&>h1]:my-3 [&>h2]:text-lg [&>h2]:font-semibold [&>h2]:my-3 [&>h3]:text-base [&>h3]:font-semibold [&>h3]:my-2 [&>ul]:list-disc [&>ul]:pl-4 [&>ul]:my-2 [&>ol]:list-decimal [&>ol]:pl-4 [&>ol]:my-2 [&>li]:my-0.5 [&>pre]:bg-muted [&>pre]:rounded-lg [&>pre]:p-3 [&>pre]:overflow-x-auto [&>pre]:my-2 [&>pre]:border [&>pre]:border-border [&_code]:text-primary [&_code]:bg-primary/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:font-mono [&>pre_code]:bg-transparent [&>pre_code]:p-0 [&>a]:text-primary [&>a]:underline [&>a]:underline-offset-2 [&>blockquote]:border-l-2 [&>blockquote]:border-primary [&>blockquote]:pl-3 [&>blockquote]:italic [&>blockquote]:text-muted-foreground [&>blockquote]:my-2 [&>table]:w-full [&>table]:border-collapse [&>table]:my-2 [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-3 [&_th]:py-1.5 [&_th]:text-left [&_th]:text-xs [&_th]:font-semibold [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-1.5 [&_td]:text-xs [&>hr]:border-border [&>hr]:my-3">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {content}
              </ReactMarkdown>
              {isStreaming && (
                <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-primary align-middle" />
              )}
            </div>
          )}
        </div>

        {/* Actions row — appears on hover */}
        {!isUser && !isStreaming && content && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title="Copy"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
            <div className="mx-1 h-3 w-px bg-border" />
            <button
              onClick={() => handleFeedback('positive')}
              className={cn(
                'rounded-lg p-1.5 transition-colors hover:bg-muted',
                feedback === 'positive' ? 'text-green-500' : 'text-muted-foreground'
              )}
              title="Helpful"
            >
              <ThumbsUp className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => handleFeedback('negative')}
              className={cn(
                'rounded-lg p-1.5 transition-colors hover:bg-muted',
                feedback === 'negative' ? 'text-red-500' : 'text-muted-foreground'
              )}
              title="Not helpful"
            >
              <ThumbsDown className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Confidence + model */}
        {!isUser && !isStreaming && confidence !== undefined && (
          <ConfidenceBadge confidence={confidence} model_used={model_used} />
        )}

        {/* Sources */}
        {sources && sources.length > 0 && !isStreaming && (
          <CitationDrawer sources={sources} />
        )}
      </div>
    </div>
  );
}
