import type { AuthIntent } from '@/types';
import type { ReadonlyURLSearchParams } from 'next/navigation';

function safePathname(pathname: string): string {
  if (!pathname.startsWith('/')) return '/dashboard';
  return pathname;
}

export function buildAuthIntent(
  nextPath: string,
  intent: string,
  contextLabel?: string
): AuthIntent {
  return {
    next: safePathname(nextPath),
    intent,
    contextLabel,
  };
}

export function buildAuthIntentQuery(intent: AuthIntent): URLSearchParams {
  const searchParams = new URLSearchParams();
  searchParams.set('next', intent.next);
  searchParams.set('intent', intent.intent);
  if (intent.contextLabel) {
    searchParams.set('contextLabel', intent.contextLabel);
  }
  return searchParams;
}

export function parseAuthIntent(
  searchParams:
    | URLSearchParams
    | ReadonlyURLSearchParams
    | Record<string, string | string[] | undefined>
): AuthIntent {
  const get = (key: string): string | undefined => {
    if (searchParams instanceof URLSearchParams) {
      return searchParams.get(key) || undefined;
    }

    const withGetter = searchParams as { get?: (name: string) => string | null };
    if (typeof withGetter.get === 'function') {
      return withGetter.get(key) || undefined;
    }

    const value = searchParams[key];
    if (Array.isArray(value)) return value[0];
    return value;
  };

  return {
    next: safePathname(get('next') || '/dashboard'),
    intent: get('intent') || 'continue',
    contextLabel: get('contextLabel') || undefined,
  };
}
