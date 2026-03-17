import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS, getClientIp, isLikelyBot } from '@/lib/rate-limiter';
import { recordUsageEvent } from '@/lib/usage-logger';
import {
  createWidgetSessionToken,
  refreshWidgetSessionToken,
} from '@/lib/security/widget-auth';
import { addCorsHeaders, handlePreflight, warnPermissiveDevOrigins } from '@/lib/security/cors';
import { validateOrigin } from '@/lib/security/origin';
import { v4 as uuidv4 } from 'uuid';

export async function OPTIONS(request: NextRequest) {
  return handlePreflight(request);
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('Origin') || '';

  // Helper to build JSON responses with CORS headers attached
  function corsJson(body: Record<string, unknown>, status: number) {
    return addCorsHeaders(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
      origin
    );
  }

  // Bot detection
  if (isLikelyBot(request)) {
    return corsJson({ error: 'Automated requests are not allowed' }, 403);
  }

  // Rate limit by IP
  const clientIp = getClientIp(request);
  const ipLimit = checkRateLimit(`widget-session:ip:${clientIp}`, RATE_LIMITS.widgetSession);
  if (!ipLimit.allowed) {
    return addCorsHeaders(
      new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(Math.ceil((ipLimit.retryAfterMs || 60000) / 1000)),
        },
      }),
      origin
    );
  }

  // Parse JSON body
  let body: { api_key?: string; session_jti?: string };
  try {
    body = await request.json();
  } catch {
    return corsJson({ error: 'Invalid JSON body' }, 400);
  }

  const { api_key, session_jti } = body;

  if (!api_key) {
    return corsJson({ error: 'Missing api_key' }, 400);
  }

  if (!origin) {
    return corsJson({ error: 'Origin header is required' }, 403);
  }

  const supabase = createServiceClient();

  // Look up API key
  const { data: apiKeyRow, error: apiKeyError } = await supabase
    .from('widget_api_keys')
    .select('id, agent_id, allowed_origins, is_active')
    .eq('public_key', api_key)
    .single();

  if (apiKeyError || !apiKeyRow || !apiKeyRow.is_active) {
    return corsJson({ error: 'Invalid or inactive API key' }, 403);
  }

  // Look up agent
  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select('id, name, status, visibility')
    .eq('id', apiKeyRow.agent_id)
    .single();

  if (agentError || !agent) {
    return corsJson({ error: 'Agent not found' }, 403);
  }

  if (agent.status !== 'ready' || agent.visibility !== 'public') {
    return corsJson({ error: 'Agent is not available' }, 403);
  }

  // Validate Origin against allowed_origins
  const allowedOrigins: string[] = apiKeyRow.allowed_origins || [];
  const allowEmptyList = process.env.NODE_ENV !== 'production';
  if (allowedOrigins.length === 0 && allowEmptyList) {
    warnPermissiveDevOrigins('/api/widget/session');
  }
  if (!validateOrigin(origin, allowedOrigins, { allowEmptyList })) {
    return corsJson({ error: 'Origin not allowed' }, 403);
  }

  // Get agent settings for response payload
  const { data: agentSettings } = await supabase
    .from('agent_settings')
    .select('welcome_message, starter_questions, theme_color')
    .eq('agent_id', agent.id)
    .single();

  let sessionToken: string;
  let sessionJti: string;
  let expiresAt: Date;
  let didRefreshExistingSession = false;
  let existingSessionId: string | null = null;

  if (session_jti) {
    // Attempt to refresh an existing session
    const { data: existingSession } = await supabase
      .from('widget_sessions')
      .select('id, session_token, session_jti, api_key_id')
      .eq('session_jti', session_jti)
      .eq('api_key_id', apiKeyRow.id)
      .maybeSingle();

    if (existingSession?.session_token) {
      existingSessionId = existingSession.id;
      // Try refreshing the existing token
      const refreshed = refreshWidgetSessionToken(existingSession.session_token);

      if (refreshed) {
        sessionToken = refreshed.token;
        sessionJti = session_jti;
        expiresAt = new Date(refreshed.payload.exp * 1000);
        didRefreshExistingSession = true;
      } else {
        // Token too old to refresh -- create a new token with the same jti
        sessionToken = createWidgetSessionToken(agent.id, apiKeyRow.id, origin || null, session_jti);
        sessionJti = session_jti;
        expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      }
    } else {
      const { data: conflictingSession } = await supabase
        .from('widget_sessions')
        .select('id')
        .eq('session_jti', session_jti)
        .maybeSingle();

      // No matching session found -- reuse the provided jti only if it is not already claimed elsewhere
      sessionJti = conflictingSession ? uuidv4() : session_jti;
      sessionToken = createWidgetSessionToken(agent.id, apiKeyRow.id, origin || null, sessionJti);
      expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    }
  } else {
    // Brand new session
    sessionJti = uuidv4();
    sessionToken = createWidgetSessionToken(agent.id, apiKeyRow.id, origin || null, sessionJti);
    expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  }

  const sessionRow = {
    session_jti: sessionJti,
    api_key_id: apiKeyRow.id,
    agent_id: agent.id,
    session_token: sessionToken,
    expires_at: expiresAt.toISOString(),
    origin: origin || null,
  };

  if (existingSessionId) {
    const { error: updateError } = await supabase
      .from('widget_sessions')
      .update(sessionRow)
      .eq('id', existingSessionId)
      .eq('api_key_id', apiKeyRow.id);

    if (updateError) {
      return corsJson({ error: 'Failed to persist widget session' }, 500);
    }
  } else {
    const { error: insertError } = await supabase
      .from('widget_sessions')
      .insert(sessionRow);

    if (insertError && insertError.code === '23505' && session_jti) {
      sessionJti = uuidv4();
      sessionToken = createWidgetSessionToken(agent.id, apiKeyRow.id, origin || null, sessionJti);
      expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const { error: retryInsertError } = await supabase.from('widget_sessions').insert({
        ...sessionRow,
        session_jti: sessionJti,
        session_token: sessionToken,
        expires_at: expiresAt.toISOString(),
      });

      if (retryInsertError) {
        return corsJson({ error: 'Failed to persist widget session' }, 500);
      }
    } else if (insertError) {
      return corsJson({ error: 'Failed to persist widget session' }, 500);
    }
  }

  // Fire-and-forget usage event
  recordUsageEvent({
    agent_id: agent.id,
    event_type: 'widget_session',
    metadata: {
      api_key_id: apiKeyRow.id,
      session_jti: sessionJti,
      origin: origin || null,
      is_refresh: didRefreshExistingSession,
      ip: clientIp,
    },
  });

  return corsJson(
    {
      session_token: sessionToken,
      session_jti: sessionJti,
      agent: {
        id: agent.id,
        name: agent.name,
        welcome_message: agentSettings?.welcome_message || null,
        starter_questions: agentSettings?.starter_questions || [],
        theme_color: agentSettings?.theme_color || '#171717',
      },
      expires_at: expiresAt.toISOString(),
    },
    200
  );
}
