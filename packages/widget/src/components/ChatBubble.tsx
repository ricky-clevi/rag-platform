import React from 'react';
import { cn } from '../utils/cn';

interface ChatBubbleProps {
  position: 'bottom-right' | 'bottom-left';
  isOpen: boolean;
  onClick: () => void;
  primaryColor?: string;
  bubbleIcon?: string;
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function ChatBubble({ position, isOpen, onClick, primaryColor, bubbleIcon }: ChatBubbleProps) {
  const posClass = position === 'bottom-left' ? 'left' : 'right';
  const style = primaryColor ? { background: primaryColor } as React.CSSProperties : undefined;

  return (
    <button
      className={cn('af-bubble', posClass)}
      onClick={onClick}
      style={style}
      aria-label={isOpen ? 'Close chat' : 'Open chat'}
    >
      {bubbleIcon ? (
        // bubbleIcon should be a URL to an image, not raw HTML (to prevent XSS)
        <img src={bubbleIcon} alt="" style={{ width: 24, height: 24 }} />
      ) : isOpen ? (
        <CloseIcon />
      ) : (
        <ChatIcon />
      )}
    </button>
  );
}
