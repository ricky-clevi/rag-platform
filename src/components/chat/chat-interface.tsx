'use client';

import { useRef, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { MessageBubble } from './message-bubble';
import { ChatInput } from './chat-input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bot, Globe, Plus, ShieldCheck } from 'lucide-react';
import { useChat } from '@/hooks/use-chat';

interface ChatInterfaceProps {
  agentId: string;
  agentName: string;
  companyName: string;
  welcomeMessage?: string;
  starterQuestions?: string[];
  agentUrl?: string;
  shareToken?: string;
}

export function ChatInterface({
  agentId,
  agentName,
  companyName,
  welcomeMessage,
  starterQuestions = [],
  agentUrl,
  shareToken,
}: ChatInterfaceProps) {
  const t = useTranslations('chat');
  const chatMessages = useMemo(
    () => ({
      requestFailed: t('requestFailed'),
      retryAfter: t.raw('retryAfter'),
      noResponseBody: t('noResponseBody'),
      streamError: t('error'),
      genericError: t('error'),
    }),
    [t]
  );
  const { messages, isLoading, sendMessage, resetChat } = useChat(
    agentId,
    shareToken,
    chatMessages
  );
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const defaultWelcome = t('welcome', { companyName });

  const handleStarterClick = (question: string) => {
    if (!isLoading) sendMessage(question);
  };

  let displayDomain = companyName;
  if (agentUrl) {
    try {
      displayDomain = new URL(agentUrl).hostname.replace(/^www\./, '');
    } catch {
      displayDomain = companyName;
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[1.9rem] border border-border/70 bg-white/78 shadow-[0_20px_48px_rgba(31,37,32,0.08)]">
      <div className="border-b border-border/70 bg-background/92 px-4 py-4 backdrop-blur-sm sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                <Bot className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold">{agentName}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Globe className="h-3.5 w-3.5" />
                    {displayDomain}
                  </span>
                  <span>{t('poweredBy')}</span>
                </div>
              </div>
            </div>
            <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">
              {t('groundedCopy', { companyName })}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="outline" className="bg-white/90">
                {t('groundedLabel')}
              </Badge>
              <Badge variant="outline" className="bg-white/90">
                <ShieldCheck className="mr-1 h-3 w-3" />
                {t('sources')}
              </Badge>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={resetChat}
            className="shrink-0 gap-1.5"
            aria-label={t('newConversation')}
          >
            <Plus className="h-3.5 w-3.5" />
            {t('newConversation')}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
          {messages.length === 0 ? (
            <div className="flex min-h-[58vh] flex-col items-center justify-center py-16 text-center">
              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-[1.5rem] border border-primary/20 bg-primary/10 shadow-sm">
                <Bot className="h-8 w-8 text-primary" />
              </div>
              <h2 className="mb-2 text-2xl font-semibold tracking-tight">{agentName}</h2>
              <p className="mb-8 max-w-xl text-sm leading-7 text-muted-foreground">
                {welcomeMessage || defaultWelcome}
              </p>
              {starterQuestions.length > 0 ? (
                <div className="w-full max-w-2xl space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {t('starterTitle')}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {starterQuestions.map((question) => (
                      <button
                        key={question}
                        type="button"
                        onClick={() => handleStarterClick(question)}
                        disabled={isLoading}
                        className="rounded-[1.25rem] border border-border bg-card px-4 py-3 text-left text-sm text-foreground shadow-sm transition-all duration-150 hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50"
                      >
                        {question}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  role={message.role}
                  content={message.content}
                  sources={message.sources}
                  isStreaming={message.isStreaming}
                  confidence={message.confidence}
                  model_used={message.model_used}
                  answered_from_sources_only={message.answered_from_sources_only}
                />
              ))}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-border/70 bg-gradient-to-t from-background via-background to-transparent px-4 pb-4 pt-3 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <ChatInput
            onSend={sendMessage}
            disabled={isLoading}
            placeholder={t('placeholder', { companyName })}
          />
        </div>
      </div>
    </div>
  );
}
