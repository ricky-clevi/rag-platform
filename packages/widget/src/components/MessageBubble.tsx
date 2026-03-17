import React from 'react';
import { cn } from '../utils/cn';
import { renderMarkdown } from '../utils/markdown';
import { SourceList } from './SourceList';
import type { ChatMessage } from '../types';

interface MessageBubbleProps {
  message: ChatMessage;
  showSources: boolean;
}

export function MessageBubble({ message, showSources }: MessageBubbleProps) {
  const isAssistant = message.role === 'assistant';

  return (
    <div className={cn('af-msg', message.role)}>
      <div
        className={cn('af-msg-content', isAssistant && message.isStreaming && 'af-streaming')}
        {...(isAssistant
          ? { dangerouslySetInnerHTML: { __html: renderMarkdown(message.content) } }
          : { children: message.content })}
      />
      {isAssistant && showSources && message.sources && message.sources.length > 0 && !message.isStreaming && (
        <SourceList sources={message.sources} />
      )}
    </div>
  );
}
