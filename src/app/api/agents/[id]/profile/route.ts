import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import {
  getPasscodeSessionCookieName,
  verifyPasscodeSessionToken,
} from '@/lib/security/passcode-session';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServiceClient();
  const shareToken = request.nextUrl.searchParams.get('share_token');

  const { data: agent } = await supabase
    .from('agents')
    .select('id, visibility, status')
    .eq('id', id)
    .single();

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  let validShareLink:
    | {
        id: string;
        agent_id: string;
        expires_at: string | null;
        max_uses: number | null;
        use_count: number;
      }
    | null = null;

  if (shareToken) {
    const { data: shareLink } = await supabase
      .from('share_links')
      .select('id, agent_id, expires_at, max_uses, use_count, revoked_at')
      .eq('token', shareToken)
      .is('revoked_at', null)
      .single();

    if (shareLink?.agent_id === id) {
      const expired = shareLink.expires_at && new Date(shareLink.expires_at) < new Date();
      const exhausted = shareLink.max_uses && shareLink.use_count >= shareLink.max_uses;
      if (!expired && !exhausted) {
        validShareLink = shareLink;
      }
    }
  }

  const passcodeSession = request.cookies.get(getPasscodeSessionCookieName(id))?.value;
  const hasValidPasscodeSession = passcodeSession
    ? verifyPasscodeSessionToken(passcodeSession, id)
    : false;

  if (agent.visibility === 'private' && !validShareLink) {
    return NextResponse.json({ error: 'This agent requires a valid share link' }, { status: 403 });
  }

  if (agent.visibility === 'passcode' && !validShareLink && !hasValidPasscodeSession) {
    return NextResponse.json({ error: 'Passcode verification required' }, { status: 403 });
  }

  const { data: settings } = await supabase
    .from('agent_settings')
    .select('company_profile')
    .eq('agent_id', id)
    .single();

  return NextResponse.json({
    profile: settings?.company_profile || {},
    agent_status: agent.status,
  });
}
