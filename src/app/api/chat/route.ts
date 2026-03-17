import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS, getClientIp, isLikelyBot } from '@/lib/rate-limiter';
import {
  getPasscodeSessionCookieName,
  verifyPasscodeSessionToken,
} from '@/lib/security/passcode-session';
import { runChatRequest } from '@/lib/chat/core';

export async function POST(request: NextRequest) {
  // Bot detection (#18)
  if (isLikelyBot(request)) {
    return new Response(JSON.stringify({ error: 'Automated requests are not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Rate limiting (#17)
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
        },
      }
    );
  }

  const contentType = request.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    return new Response(JSON.stringify({ error: 'Content-Type must be application/json' }), {
      status: 415,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: { agent_id?: string; message?: string; conversation_id?: string; session_id?: string; share_token?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const { agent_id, message, conversation_id, session_id, share_token } = body;

  if (!agent_id || !message || !session_id) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Per-session rate limit
  const sessionLimit = checkRateLimit(`chat:session:${agent_id}:${session_id}`, RATE_LIMITS.chatSession);
  if (!sessionLimit.allowed) {
    return new Response(
      JSON.stringify({ error: 'Too many messages. Please slow down.' }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(Math.ceil((sessionLimit.retryAfterMs || 30000) / 1000)),
        },
      }
    );
  }

  const supabase = createServiceClient();

  // Get agent
  const { data: agent } = await supabase
    .from('agents')
    .select('*')
    .eq('id', agent_id)
    .single();

  if (!agent) {
    return new Response(JSON.stringify({ error: 'Agent not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (agent.status !== 'ready') {
    return new Response(JSON.stringify({ error: 'Agent is not ready yet' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let validShareLink: {
    id: string;
    agent_id: string;
    expires_at: string | null;
    max_uses: number | null;
    use_count: number;
  } | null = null;

  // Share link validation (#14, #15, #16)
  if (share_token) {
    const { data: shareLink } = await supabase
      .from('share_links')
      .select('id, agent_id, expires_at, max_uses, use_count, revoked_at')
      .eq('token', share_token)
      .is('revoked_at', null)
      .single();

    if (!shareLink) {
      return new Response(JSON.stringify({ error: 'Invalid share link' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (shareLink.agent_id !== agent_id) {
      return new Response(JSON.stringify({ error: 'Invalid share link' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check expiration
    if (shareLink.expires_at && new Date(shareLink.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'Share link has expired' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check max uses
    if (shareLink.max_uses && shareLink.use_count >= shareLink.max_uses) {
      return new Response(JSON.stringify({ error: 'Share link usage limit reached' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    validShareLink = shareLink;
  }

  const passcodeSession = request.cookies.get(getPasscodeSessionCookieName(agent_id))?.value;
  const hasValidPasscodeSession = passcodeSession
    ? verifyPasscodeSessionToken(passcodeSession, agent_id)
    : false;

  if (agent.visibility === 'private' && !validShareLink) {
    return new Response(JSON.stringify({ error: 'This agent requires a valid share link' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (agent.visibility === 'passcode' && !validShareLink && !hasValidPasscodeSession) {
    return new Response(JSON.stringify({ error: 'Passcode verification required' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Get agent settings
  const { data: agentSettings } = await supabase
    .from('agent_settings')
    .select('*')
    .eq('agent_id', agent_id)
    .single();

  // Increment share link use count before entering core pipeline
  if (validShareLink && !conversation_id) {
    await supabase.rpc('increment_counter', {
      table_name: 'share_links',
      row_id: validShareLink.id,
      column_name: 'use_count',
    }).then(null, () => {
      return supabase
        .from('share_links')
        .update({ use_count: (validShareLink!.use_count || 0) + 1 })
        .eq('id', validShareLink!.id);
    });
  }

  // Delegate to shared chat service
  const result = await runChatRequest({
    supabase,
    agentId: agent_id,
    agent: { name: agent.name, root_url: agent.root_url },
    agentSettings,
    message,
    sessionId: session_id,
    conversationId: conversation_id,
    shareLinkId: validShareLink?.id,
    eventType: 'chat',
    clientIp,
  });

  return new Response(result.stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
