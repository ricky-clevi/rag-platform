import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import {
  getPasscodeSessionCookieName,
  verifyPasscodeSessionToken,
} from '@/lib/security/passcode-session';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { feedback, session_id, share_token } = await request.json();

  if (feedback !== null && feedback !== 'positive' && feedback !== 'negative') {
    return NextResponse.json({ error: 'Invalid feedback value' }, { status: 400 });
  }

  const authClient = await createClient();
  const supabase = createServiceClient();
  const { data: { user } } = await authClient.auth.getUser();

  const { data: message, error: messageError } = await supabase
    .from('messages')
    .select('id, role, conversation_id')
    .eq('id', id)
    .single();

  if (messageError || !message || message.role !== 'assistant' || !message.conversation_id) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  }

  const { data: conversation, error: conversationError } = await supabase
    .from('conversations')
    .select('id, agent_id, session_id')
    .eq('id', message.conversation_id)
    .single();

  if (conversationError || !conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select('id, user_id')
    .eq('id', conversation.agent_id)
    .single();

  if (agentError || !agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  const isOwner = user?.id === agent.user_id;
  const hasConversationSession =
    typeof session_id === 'string'
    && session_id.length > 0
    && conversation.session_id === session_id;
  const passcodeSession = request.cookies.get(getPasscodeSessionCookieName(agent.id))?.value;
  const hasPasscodeSession = passcodeSession
    ? verifyPasscodeSessionToken(passcodeSession, agent.id)
    : false;

  let hasShareAccess = false;
  if (typeof share_token === 'string' && share_token.trim().length > 0) {
    const { data: shareLink } = await supabase
      .from('share_links')
      .select('agent_id, expires_at, max_uses, use_count, revoked_at')
      .eq('token', share_token.trim())
      .is('revoked_at', null)
      .single();

    if (
      shareLink
      && shareLink.agent_id === agent.id
      && (!shareLink.expires_at || new Date(shareLink.expires_at) >= new Date())
      && (!shareLink.max_uses || shareLink.use_count < shareLink.max_uses)
    ) {
      hasShareAccess = true;
    }
  }

  if (!isOwner && !hasConversationSession && !hasPasscodeSession && !hasShareAccess) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { error } = await supabase
    .from('messages')
    .update({ feedback })
    .eq('id', id)
    .eq('role', 'assistant');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
