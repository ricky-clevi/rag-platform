'use client';

import { useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageBubble } from './message-bubble';
import { ChatInput } from './chat-input';
import { Button } from '@/components/ui/button';
import { Bot, RotateCcw } from 'lucide-react';
import { useChat } from '@/hooks/use-chat';

interface ChatInterfaceProps {
  agentId: string;
  agentName: string;
  companyName: string;
  welcomeMessage?: string;
}

export function ChatInterface({
  agentId,
  agentName,
  companyName,
  welcomeMessage,
}: ChatInterfaceProps) {
  const t = useTranslations('chat');
  const { messages, isLoading, sendMessage, resetChat } = useChat(agentId);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const defaultWelcome = t('welcome', { companyName });

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
            <MessageBubble
              role="assistant"
              content={welcomeMessage || defaultWelcome}
            />
          )}

          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              role={msg.role}
              content={msg.content}
              sources={msg.sources}
              isStreaming={msg.isStreaming}
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
