'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Bot,
  User,
  AlertTriangle,
  ThumbsUp,
  ThumbsDown,
  Copy,
  Check,
} from 'lucide-react';
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
  const t = useTranslations('chat');
  const [feedback, setFeedback] = useState<'positive' | 'negative' | null>(null);
  const [copied, setCopied] = useState(false);
  const isUser = role === 'user';
  const isLowConfidence = confidence !== undefined && confidence < 0.4;
  const usedGeneralKnowledge = answered_from_sources_only === false;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const handleFeedback = (type: 'positive' | 'negative') => {
    setFeedback((current) => (current === type ? null : type));
  };

  return (
    <div className={cn('group flex gap-3', isUser && 'flex-row-reverse')}>
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'border border-primary/20 bg-primary/10 text-primary'
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      <div className={cn('max-w-[88%] space-y-2', isUser && 'flex flex-col items-end')}>
        {!isUser && !isStreaming && isLowConfidence ? (
          <div className="flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span>{t('lowConfidenceWarning')}</span>
          </div>
        ) : null}

        {!isUser && !isStreaming && usedGeneralKnowledge && !isLowConfidence ? (
          <div className="flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-300">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span>{t('generalKnowledgeWarning')}</span>
          </div>
        ) : null}

        <div
          className={cn(
            'rounded-[1.5rem] px-4 py-3 text-sm leading-relaxed',
            isUser
              ? 'rounded-br-md bg-primary text-primary-foreground'
              : 'rounded-bl-md border border-border bg-card shadow-sm'
          )}
        >
          {isStreaming && !content ? (
            <div className="flex items-center gap-1 py-1">
              <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground" />
            </div>
          ) : isUser ? (
            <span className="whitespace-pre-wrap">{content}</span>
          ) : (
            <div className="[&>p]:my-2 [&>p]:leading-relaxed [&>h1]:my-3 [&>h1]:text-xl [&>h1]:font-bold [&>h2]:my-3 [&>h2]:text-lg [&>h2]:font-semibold [&>h3]:my-2 [&>h3]:text-base [&>h3]:font-semibold [&>ul]:my-2 [&>ul]:list-disc [&>ul]:pl-4 [&>ol]:my-2 [&>ol]:list-decimal [&>ol]:pl-4 [&>li]:my-0.5 [&>pre]:my-2 [&>pre]:overflow-x-auto [&>pre]:rounded-lg [&>pre]:border [&>pre]:border-border [&>pre]:bg-muted [&>pre]:p-3 [&_code]:rounded [&_code]:bg-primary/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_code]:font-mono [&>pre_code]:bg-transparent [&>pre_code]:p-0 [&>a]:text-primary [&>a]:underline [&>a]:underline-offset-2 [&>blockquote]:my-2 [&>blockquote]:border-l-2 [&>blockquote]:border-primary [&>blockquote]:pl-3 [&>blockquote]:italic [&>blockquote]:text-muted-foreground [&>table]:my-2 [&>table]:w-full [&>table]:border-collapse [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-3 [&_th]:py-1.5 [&_th]:text-left [&_th]:text-xs [&_th]:font-semibold [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-1.5 [&_td]:text-xs [&>hr]:my-3 [&>hr]:border-border">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              {isStreaming ? (
                <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-primary align-middle" />
              ) : null}
            </div>
          )}
        </div>

        {!isUser && !isStreaming && content ? (
          <div className="flex items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title={t('copy')}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              <span>{copied ? t('copied') : t('copy')}</span>
            </button>
            <div className="mx-1 h-3 w-px bg-border" />
            <button
              type="button"
              onClick={() => handleFeedback('positive')}
              className={cn(
                'rounded-lg p-1.5 transition-colors hover:bg-muted',
                feedback === 'positive' ? 'text-green-500' : 'text-muted-foreground'
              )}
              title={t('helpful')}
              aria-label={t('helpful')}
            >
              <ThumbsUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleFeedback('negative')}
              className={cn(
                'rounded-lg p-1.5 transition-colors hover:bg-muted',
                feedback === 'negative' ? 'text-red-500' : 'text-muted-foreground'
              )}
              title={t('notHelpful')}
              aria-label={t('notHelpful')}
            >
              <ThumbsDown className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}

        {!isUser && !isStreaming && confidence !== undefined ? (
          <ConfidenceBadge confidence={confidence} model_used={model_used} />
        ) : null}

        {sources && sources.length > 0 && !isStreaming ? (
          <CitationDrawer sources={sources} />
        ) : null}
      </div>
    </div>
  );
}
