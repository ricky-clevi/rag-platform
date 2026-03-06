import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { buildAuthIntent, buildAuthIntentQuery } from '@/lib/auth-intent';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Extract locale from path
  const localeMatch = pathname.match(/^\/(en|ko)(\/|$)/);
  const locale = localeMatch ? localeMatch[1] : 'en';

  // Protected routes that need auth
  const protectedSegments = ['/dashboard', '/agents', '/data', '/monitor', '/insights'];
  const isProtectedRoute = protectedSegments.some((segment) => pathname.includes(segment));

  // Auth routes (login/signup)
  const isAuthRoute =
    pathname.includes('/login') || pathname.includes('/signup');

  // Public agent pages are always accessible
  const isAgentPage = pathname.includes('/agent/');

  if (isAgentPage) {
    return supabaseResponse;
  }

  if (!user && isProtectedRoute) {
    const url = request.nextUrl.clone();
    const intent = buildAuthIntent(
      `${pathname}${request.nextUrl.search}`,
      pathname.includes('/agents/new')
        ? 'create-agent'
        : pathname.includes('/data')
          ? 'open-data'
          : pathname.includes('/monitor')
            ? 'open-monitor'
            : pathname.includes('/insights')
              ? 'open-insights'
            : pathname.includes('/dashboard')
                ? 'open-home'
                : 'continue',
    );
    url.pathname = `/${locale}/login`;
    url.search = `?${buildAuthIntentQuery(intent).toString()}`;
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const target = request.nextUrl.searchParams.get('next');
    if (target) {
      return NextResponse.redirect(new URL(target, request.url));
    }

    const url = request.nextUrl.clone();
    url.pathname = `/${locale}/dashboard`;
    url.search = '';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
