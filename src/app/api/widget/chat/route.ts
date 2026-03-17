import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS, getClientIp, isLikelyBot } from '@/lib/rate-limiter';
import { verifyWidgetSessionToken } from '@/lib/security/widget-auth';
import {
  createCorsHeaders,
  handlePreflight,
  warnPermissiveDevOrigins,
} from '@/lib/security/cors';
import { validateOrigin } from '@/lib/security/origin';
import { runChatRequest } from '@/lib/chat/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function errorResponse(message: string, status: number, origin: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...createCorsHeaders(origin) },
  });
}

// ---------------------------------------------------------------------------
// OPTIONS — CORS preflight
// ---------------------------------------------------------------------------

export function OPTIONS(request: NextRequest) {
  return handlePreflight(request);
}

// ---------------------------------------------------------------------------
// POST — Widget chat message
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const origin = request.headers.get('Origin') || '*';

  // 1. Extract & verify session token from Authorization header
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorResponse('Missing or malformed authorization token', 401, origin);
  }

  const token = authHeader.slice(7); // strip "Bearer "
  const verification = verifyWidgetSessionToken(token);
  if (!verification.valid) {
    return errorResponse('Invalid or expired session token', 401, origin);
  }

  const { payload } = verification;

  // 2. Verify session exists in DB and is not expired
  const supabase = createServiceClient();

  const { data: session } = await supabase
    .from('widget_sessions')
    .select('id, expires_at, api_key_id, agent_id')
    .eq('session_jti', payload.jti)
    .single();

  if (!session) {
    return errorResponse('Session not found', 401, origin);
  }

  if (session.api_key_id !== payload.apiKeyId || session.agent_id !== payload.agentId) {
    return errorResponse('Session does not match token', 401, origin);
  }

  if (session.expires_at && new Date(session.expires_at) < new Date()) {
    return errorResponse('Session has expired', 401, origin);
  }

  // 3. Verify API key is active
  const { data: apiKey } = await supabase
    .from('widget_api_keys')
    .select('id, is_active, allowed_origins, agent_id, rate_limit_per_minute')
    .eq('id', payload.apiKeyId)
    .single();

  if (!apiKey || !apiKey.is_active) {
    return errorResponse('API key is inactive or not found', 403, origin);
  }

  // 4. Validate origin against key's allowed_origins AND token's bound origin
  const requestOrigin = request.headers.get('Origin');
  if (requestOrigin) {
    const allowedOrigins: string[] = apiKey.allowed_origins || [];
    const allowEmptyList = process.env.NODE_ENV !== 'production';
    if (allowedOrigins.length === 0 && allowEmptyList) {
      warnPermissiveDevOrigins('/api/widget/chat');
    }
    if (!validateOrigin(requestOrigin, allowedOrigins, { allowEmptyList })) {
      return errorResponse('Origin not allowed', 403, origin);
    }
    // Verify request origin matches the origin bound to the session token
    if (payload.origin && requestOrigin.toLowerCase() !== payload.origin.toLowerCase()) {
      return errorResponse('Origin does not match session', 403, origin);
    }
  } else if (payload.origin) {
    // Token was created with an origin binding, but this request has no Origin header.
    // This indicates a non-browser replay of a stolen token — reject.
    return errorResponse('Origin header required for this session', 403, origin);
  }

  // 5. Rate limiting: per API key (using key's custom rate_limit_per_minute) + per IP
  const keyRateConfig = apiKey.rate_limit_per_minute
    ? { maxRequests: apiKey.rate_limit_per_minute, windowMs: 60_000, blockDurationMs: 60_000 }
    : RATE_LIMITS.widgetChat;
  const keyLimit = checkRateLimit(`widget:key:${payload.apiKeyId}`, keyRateConfig);
  if (!keyLimit.allowed) {
    return new Response(
      JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(Math.ceil((keyLimit.retryAfterMs || 60000) / 1000)),
          ...createCorsHeaders(origin),
        },
      }
    );
  }

  const clientIp = getClientIp(request);
  const ipLimit = checkRateLimit(`chat:ip:${clientIp}`, RATE_LIMITS.chat);
  if (!ipLimit.allowed) {
    return new Response(
      JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(Math.ceil((ipLimit.retryAfterMs || 60000) / 1000)),
          ...createCorsHeaders(origin),
        },
      }
    );
  }

  const sessionLimit = checkRateLimit(
    `widget:session:${payload.agentId}:${payload.jti}`,
    RATE_LIMITS.widgetChatSession
  );
  if (!sessionLimit.allowed) {
    return new Response(
      JSON.stringify({ error: 'Too many messages. Please slow down.' }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(Math.ceil((sessionLimit.retryAfterMs || 30000) / 1000)),
          ...createCorsHeaders(origin),
        },
      }
    );
  }

  // 6. Bot detection
  if (isLikelyBot(request)) {
    return errorResponse('Automated requests are not allowed', 403, origin);
  }

  // 7. Parse and validate request body
  let body: { message?: string; conversation_id?: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400, origin);
  }

  const { message, conversation_id } = body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return errorResponse('Missing or empty message', 400, origin);
  }

  // 8. Look up agent, verify it is ready and public
  const { data: agent } = await supabase
    .from('agents')
    .select('*')
    .eq('id', payload.agentId)
    .single();

  if (!agent) {
    return errorResponse('Agent not found', 404, origin);
  }

  if (agent.status !== 'ready') {
    return errorResponse('Agent is not ready', 400, origin);
  }

  if (agent.visibility !== 'public') {
    return errorResponse('Agent is not publicly accessible', 403, origin);
  }

  // 9. Get agent settings
  const { data: agentSettings } = await supabase
    .from('agent_settings')
    .select('*')
    .eq('agent_id', payload.agentId)
    .single();

  // 10. Run chat request through shared core pipeline
  try {
    const result = await runChatRequest({
      supabase,
      agentId: payload.agentId,
      agent: { name: agent.name, root_url: agent.root_url },
      agentSettings,
      message: message.trim(),
      sessionId: payload.jti,
      conversationId: conversation_id,
      eventType: 'widget_chat',
      clientIp,
    });

    return new Response(result.stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        ...createCorsHeaders(origin),
      },
    });
  } catch (error) {
    console.error('[widget/chat] Internal error:', error);
    return errorResponse('Internal server error', 500, origin);
  }
}
