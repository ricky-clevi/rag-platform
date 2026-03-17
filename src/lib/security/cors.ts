const warnedPaths = new Set<string>();

export function warnPermissiveDevOrigins(pathname: string): void {
  if (process.env.NODE_ENV === 'production' || warnedPaths.has(pathname)) {
    return;
  }

  warnedPaths.add(pathname);
  console.warn(
    `[widget/cors] ${pathname} accepted requests with an empty allowed_origins list because NODE_ENV is not production. Configure explicit origins before production.`
  );
}

export function createCorsHeaders(origin: string): Record<string, string> {
  const safeOrigin = origin || '*';
  return {
    'Access-Control-Allow-Origin': safeOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

export function handlePreflight(request: Request): Response {
  const origin = request.headers.get('Origin') || '*';
  return new Response(null, { status: 204, headers: createCorsHeaders(origin) });
}

export function addCorsHeaders(response: Response, origin: string): Response {
  const corsHeaders = createCorsHeaders(origin);
  const newHeaders = new Headers(response.headers);

  for (const [key, value] of Object.entries(corsHeaders)) {
    newHeaders.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}
