import createMiddleware from 'next-intl/middleware';
import { type NextRequest, NextResponse } from 'next/server';
import { routing } from '@/i18n/routing';
import { updateSession } from '@/lib/supabase/middleware';

const intlMiddleware = createMiddleware(routing);

export default async function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || '';
  const appHost = process.env.NEXT_PUBLIC_APP_URL
    ? new URL(process.env.NEXT_PUBLIC_APP_URL).hostname
    : 'localhost';

  // Wildcard subdomain routing (#29)
  // e.g., acme.yourdomain.com → /en/agent/acme
  if (hostname !== appHost && !hostname.startsWith('localhost') && !hostname.startsWith('127.')) {
    const subdomain = hostname.split('.')[0];
    if (subdomain && subdomain !== 'www' && subdomain !== appHost.split('.')[0]) {
      const pathname = request.nextUrl.pathname;
      if (!pathname.startsWith('/api') && !pathname.startsWith('/_next') && !pathname.includes('/agent/')) {
        const locale = pathname.split('/')[1];
        const validLocales = ['en', 'ko'];
        const targetLocale = validLocales.includes(locale) ? locale : 'en';
        const url = request.nextUrl.clone();
        url.pathname = `/${targetLocale}/agent/${subdomain}`;
        return NextResponse.rewrite(url);
      }
    }
  }

  // Custom domain routing (#30, #31)
  // Non-subdomain external domains rewrite to agent lookup
  if (hostname !== appHost && !hostname.startsWith('localhost')) {
    const isSubdomain = hostname.endsWith('.' + appHost);
    if (!isSubdomain) {
      const pathname = request.nextUrl.pathname;
      if (!pathname.startsWith('/api') && !pathname.startsWith('/_next') && !pathname.includes('/agent/')) {
        const url = request.nextUrl.clone();
        url.pathname = `/en/agent/_domain`;
        url.searchParams.set('domain', hostname);
        return NextResponse.rewrite(url);
      }
    }
  }

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
    '/((?!api|_next|.*\\..*).*)',
  ],
};
