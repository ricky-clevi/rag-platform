import createMiddleware from 'next-intl/middleware';
import { type NextRequest, NextResponse } from 'next/server';
import { routing } from '@/i18n/routing';
import { updateSession } from '@/lib/supabase/middleware';

const intlMiddleware = createMiddleware(routing);

export default async function middleware(request: NextRequest) {
  // First handle i18n routing
  const intlResponse = intlMiddleware(request);

  // Then handle Supabase auth session
  const sessionResponse = await updateSession(request);

  // If session middleware wants to redirect, use that
  if (sessionResponse.headers.get('location')) {
    return sessionResponse;
  }

  // Merge cookies from session response into intl response
  sessionResponse.cookies.getAll().forEach((cookie) => {
    intlResponse.cookies.set(cookie.name, cookie.value);
  });

  return intlResponse;
}

export const config = {
  matcher: [
    // Match all pathnames except for
    // - API routes
    // - _next (Next.js internals)
    // - static files
    '/((?!api|_next|.*\\..*).*)',
  ],
};
