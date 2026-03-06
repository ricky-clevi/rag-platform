'use client';

import { useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { MessageBubble } from './message-bubble';
import { ChatInput } from './chat-input';
import { Button } from '@/components/ui/button';
import { Bot, Plus } from 'lucide-react';
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
  const { messages, isLoading, sendMessage, resetChat } = useChat(agentId, shareToken);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const defaultWelcome = t('welcome', { companyName });

  const handleStarterClick = (question: string) => {
    if (!isLoading) sendMessage(question);
  };

  // Extract domain from agentUrl for display
  let displayDomain: string | null = null;
  if (agentUrl) {
    try {
      displayDomain = new URL(agentUrl).hostname.replace(/^www\./, '');
    } catch {
      displayDomain = agentUrl;
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-background/95 backdrop-blur-sm px-4 py-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/80 to-primary text-primary-foreground shadow-sm">
            <Bot className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold leading-tight truncate">{agentName}</h2>
            {displayDomain && (
              <p className="text-xs text-muted-foreground truncate leading-tight">{displayDomain}</p>
            )}
            {!displayDomain && (
              <p className="text-xs text-muted-foreground leading-tight">{t('poweredBy')}</p>
            )}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={resetChat}
          className="shrink-0 gap-1.5 text-xs h-8"
        >
          <Plus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{t('newConversation')}</span>
        </Button>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-6">
          {messages.length === 0 ? (
            /* Empty state / welcome screen */
            <div className="flex flex-col items-center justify-center min-h-[60vh] py-16 text-center">
              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 shadow-sm">
                <Bot className="h-8 w-8 text-primary" />
              </div>
              <h2 className="mb-2 text-xl font-semibold tracking-tight">{agentName}</h2>
              <p className="mb-8 max-w-sm text-sm text-muted-foreground leading-relaxed">
                {welcomeMessage || defaultWelcome}
              </p>
              {starterQuestions.length > 0 && (
                <div className="grid gap-2 sm:grid-cols-2 max-w-lg w-full">
                  {starterQuestions.map((question, index) => (
                    <button
                      key={index}
                      onClick={() => handleStarterClick(question)}
                      disabled={isLoading}
                      className="rounded-xl border border-border bg-card px-4 py-3 text-left text-sm text-foreground hover:border-primary/40 hover:bg-primary/5 transition-all duration-150 disabled:opacity-50 shadow-sm"
                    >
                      {question}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  role={msg.role}
                  content={msg.content}
                  sources={msg.sources}
                  isStreaming={msg.isStreaming}
                  confidence={msg.confidence}
                  model_used={msg.model_used}
                  answered_from_sources_only={msg.answered_from_sources_only}
                />
              ))}
            </div>
          )}
          {/* Scroll anchor */}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="shrink-0 border-t border-border bg-gradient-to-t from-background via-background to-transparent pt-3 pb-4 px-4">
        <div className="mx-auto max-w-2xl">
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
