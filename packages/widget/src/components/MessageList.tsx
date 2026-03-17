import React, { useEffect, useRef } from 'react';
import { MessageBubble } from './MessageBubble';
import type { ChatMessage } from '../types';

interface MessageListProps {
  messages: ChatMessage[];
  showSources: boolean;
}

export function MessageList({ messages, showSources }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="af-messages">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} showSources={showSources} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
