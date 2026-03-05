'use client';

import { useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageBubble } from './message-bubble';
import { ChatInput } from './chat-input';
import { Button } from '@/components/ui/button';
import { Bot, RotateCcw, MessageCircle } from 'lucide-react';
import { useChat } from '@/hooks/use-chat';

interface ChatInterfaceProps {
  agentId: string;
  agentName: string;
  companyName: string;
  welcomeMessage?: string;
  starterQuestions?: string[];
  shareToken?: string;
}

export function ChatInterface({
  agentId,
  agentName,
  companyName,
  welcomeMessage,
  starterQuestions = [],
  shareToken,
}: ChatInterfaceProps) {
  const t = useTranslations('chat');
  const { messages, isLoading, sendMessage, resetChat } = useChat(agentId, shareToken);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const defaultWelcome = t('welcome', { companyName });

  const handleStarterClick = (question: string) => {
    sendMessage(question);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Chat Header */}
      <div className="flex items-center justify-between border-b px-3 py-2 sm:px-4 sm:py-3">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Bot className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold truncate">{agentName}</h2>
            <p className="text-xs text-muted-foreground hidden sm:block">{t('poweredBy')}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={resetChat} className="shrink-0">
          <RotateCcw className="h-3 w-3 sm:mr-1" />
          <span className="hidden sm:inline">{t('newConversation')}</span>
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-3 sm:p-4" ref={scrollRef}>
        <div className="mx-auto max-w-2xl space-y-3 sm:space-y-4">
          {/* Welcome message */}
          {messages.length === 0 && (
            <>
              <MessageBubble
                role="assistant"
                content={welcomeMessage || defaultWelcome}
              />

              {/* Starter Questions */}
              {starterQuestions.length > 0 && (
                <div className="flex flex-col gap-2 pl-11">
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <MessageCircle className="h-3 w-3" />
                    Try asking:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {starterQuestions.map((question, index) => (
                      <button
                        key={index}
                        onClick={() => handleStarterClick(question)}
                        disabled={isLoading}
                        className="rounded-lg border border-border bg-card px-3 py-2 text-left text-sm text-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                      >
                        {question}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

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
      </ScrollArea>

      {/* Input */}
      <div className="border-t p-3 sm:p-4">
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
