'use client';

import { Globe, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface UrlInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function UrlInput({
  value,
  onChange,
  onSubmit,
  placeholder = 'https://example.com',
  disabled = false,
}: UrlInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSubmit(e as unknown as React.FormEvent);
    }
  };

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-xl border-2 bg-background px-4 py-3 transition-all focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20',
        disabled && 'opacity-60'
      )}
    >
      <Globe className="h-5 w-5 shrink-0 text-muted-foreground" />
      <input
        type="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        autoComplete="url"
      />
      <button
        type="submit"
        disabled={disabled || !value}
        onClick={onSubmit}
        className={cn(
          'shrink-0 rounded-lg bg-primary p-2 text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50',
        )}
      >
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}
