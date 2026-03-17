import React from 'react';
import { cn } from '../utils/cn';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { WelcomeScreen } from './WelcomeScreen';
import { PoweredBy } from './PoweredBy';
import type { AgentConfig, ChatMessage } from '../types';

interface ChatPanelProps {
  isOpen: boolean;
  position: 'bottom-right' | 'bottom-left';
  agent: AgentConfig;
  messages: ChatMessage[];
  isLoading: boolean;
  showSources: boolean;
  showPoweredBy: boolean;
  width?: number;
  height?: number;
  onSend: (message: string) => void;
  onClose: () => void;
  onNewChat: () => void;
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function NewChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

export function ChatPanel({
  isOpen,
  position,
  agent,
  messages,
  isLoading,
  showSources,
  showPoweredBy,
  width,
  height,
  onSend,
  onClose,
  onNewChat,
}: ChatPanelProps) {
  const posClass = position === 'bottom-left' ? 'left' : 'right';
  const style: React.CSSProperties = {};
  if (width) style.width = `${width}px`;
  if (height) style.height = `${height}px`;

  return (
    <div className={cn('af-panel', posClass, isOpen && 'open')} style={style}>
      <div className="af-header">
        <span className="af-header-title">{agent.name}</span>
        <div className="af-header-actions">
          <button className="af-header-btn" onClick={onNewChat} aria-label="New chat" title="New conversation">
            <NewChatIcon />
          </button>
          <button className="af-header-btn" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>
      </div>

      {messages.length === 0 ? (
        <WelcomeScreen agent={agent} onStarterClick={onSend} />
      ) : (
        <MessageList messages={messages} showSources={showSources} />
      )}

      <ChatInput onSend={onSend} disabled={isLoading} />
      {showPoweredBy && <PoweredBy />}
    </div>
  );
}
