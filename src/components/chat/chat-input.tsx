'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

const MAX_ROWS = 4;
const LINE_HEIGHT = 24;
const CHAR_COUNTER_THRESHOLD = 800;

export function ChatInput({
  onSend,
  disabled = false,
  placeholder,
}: ChatInputProps) {
  const t = useTranslations('chat');
  const [input, setInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;

    element.style.height = 'auto';
    const maxHeight = LINE_HEIGHT * MAX_ROWS + 24;
    element.style.height = `${Math.min(element.scrollHeight, maxHeight)}px`;
  }, [input]);

  const canSend = input.trim().length > 0 && !disabled;
  const charCount = input.length;
  const showCounter = charCount > CHAR_COUNTER_THRESHOLD;

  const handleSubmit = () => {
    if (!canSend) return;

    onSend(input.trim());
    setInput('');

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="space-y-1.5">
      <div
        className={cn(
          'flex items-end gap-2 rounded-[1.65rem] border bg-background px-3 py-2 transition-all duration-200',
          isFocused
            ? 'border-primary/60 ring-2 ring-primary/20 shadow-sm'
            : 'border-border hover:border-border/80'
        )}
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder || t('inputPlaceholder')}
          disabled={disabled}
          rows={1}
          aria-label={t('inputAria')}
          className="flex-1 resize-none bg-transparent py-1 text-sm leading-6 outline-none placeholder:text-muted-foreground disabled:opacity-50"
          style={{ maxHeight: `${LINE_HEIGHT * MAX_ROWS + 24}px` }}
        />

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSend}
          aria-label={t('send')}
          className={cn(
            'mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all duration-150',
            canSend
              ? 'bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover active:scale-95'
              : 'cursor-not-allowed bg-muted text-muted-foreground'
          )}
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center justify-between px-1">
        <p className="text-[11px] text-muted-foreground/70">{t('inputHint')}</p>
        {showCounter ? (
          <p
            className={cn(
              'text-[11px] tabular-nums',
              charCount > 1200 ? 'text-red-500' : 'text-muted-foreground/70'
            )}
          >
            {charCount.toLocaleString()}
          </p>
        ) : null}
      </div>
    </div>
  );
}
