import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import bcrypt from 'bcryptjs';
import {
  createPasscodeSessionToken,
  getPasscodeSessionCookieName,
  getPasscodeSessionTtlSeconds,
} from '@/lib/security/passcode-session';
import { checkRateLimit, getClientIp, RATE_LIMITS } from '@/lib/rate-limiter';

// POST /api/agents/[id]/verify-passcode - Verify passcode for a protected agent
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Rate limit passcode attempts: 5 per minute per IP+agent
  const ip = getClientIp(request);
  const rateLimitResult = checkRateLimit(`passcode:${ip}:${id}`, {
    maxRequests: 5,
    windowMs: 60_000,
    blockDurationMs: 300_000, // 5-minute block after exceeding
  });
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Please try again later.' },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil((rateLimitResult.retryAfterMs || 60_000) / 1000)) },
      }
    );
  }

  const supabase = createServiceClient();

  const { passcode } = await request.json();

  if (!passcode) {
    return NextResponse.json({ error: 'Passcode is required' }, { status: 400 });
  }

  const { data: agent } = await supabase
    .from('agents')
    .select('id, passcode_hash, visibility')
    .eq('id', id)
    .single();

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  if (agent.visibility !== 'passcode' || !agent.passcode_hash) {
    // No passcode required
    return NextResponse.json({ valid: true });
  }

  const isValid = await bcrypt.compare(passcode, agent.passcode_hash);

  if (!isValid) {
    return NextResponse.json({ valid: false, error: 'Invalid passcode' }, { status: 401 });
  }

  const response = NextResponse.json({ valid: true });
  response.cookies.set({
    name: getPasscodeSessionCookieName(id),
    value: createPasscodeSessionToken(id),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: getPasscodeSessionTtlSeconds(),
  });

  return response;
}
