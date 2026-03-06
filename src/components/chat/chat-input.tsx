'use client';

import { useState, useRef, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

const MAX_ROWS = 4;
const LINE_HEIGHT = 24; // px — matches text-sm leading
const CHAR_COUNTER_THRESHOLD = 800;

export function ChatInput({
  onSend,
  disabled = false,
  placeholder = 'Type a message...',
}: ChatInputProps) {
  const [input, setInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea up to MAX_ROWS lines
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxHeight = LINE_HEIGHT * MAX_ROWS + 24; // +24 for padding
    el.style.height = Math.min(el.scrollHeight, maxHeight) + 'px';
  }, [input]);

  const canSend = input.trim().length > 0 && !disabled;

  const handleSubmit = () => {
    if (!canSend) return;
    onSend(input.trim());
    setInput('');
    // Reset height after clearing
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const charCount = input.length;
  const showCounter = charCount > CHAR_COUNTER_THRESHOLD;

  return (
    <div className="space-y-1.5">
      <div
        className={cn(
          'flex items-end gap-2 rounded-2xl border bg-background px-3 py-2 transition-all duration-200',
          isFocused
            ? 'border-primary/60 ring-2 ring-primary/20 shadow-sm'
            : 'border-border hover:border-border/80'
        )}
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          aria-label="Chat message"
          className="flex-1 resize-none bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50 leading-6"
          style={{ maxHeight: LINE_HEIGHT * MAX_ROWS + 24 + 'px' }}
        />

        {/* Send button */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSend}
          aria-label="Send message"
          className={cn(
            'mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all duration-150',
            canSend
              ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm active:scale-95'
              : 'bg-muted text-muted-foreground cursor-not-allowed'
          )}
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </div>

      {/* Footer hints */}
      <div className="flex items-center justify-between px-1">
        <p className="text-[11px] text-muted-foreground/60">
          Enter to send&nbsp;&nbsp;·&nbsp;&nbsp;Shift+Enter for new line
        </p>
        {showCounter && (
          <p
            className={cn(
              'text-[11px] tabular-nums',
              charCount > 1200 ? 'text-red-500' : 'text-muted-foreground/60'
            )}
          >
            {charCount.toLocaleString()}
          </p>
        )}
      </div>
    </div>
  );
}
