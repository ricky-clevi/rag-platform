import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';

// GET /api/agents/[id]/share-links - List share links for an agent
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Verify ownership
  const { data: agent } = await supabase
    .from('agents')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  const { data: links, error } = await supabase
    .from('share_links')
    .select('id, agent_id, token, label, expires_at, max_uses, use_count, revoked_at, created_at')
    .eq('agent_id', id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ share_links: links });
}

// POST /api/agents/[id]/share-links - Create a new share link
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const serviceClient = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Verify ownership
  const { data: agent } = await supabase
    .from('agents')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  const body = await request.json();
  const { label, passcode, expires_at, max_uses } = body;

  // Generate a unique token
  const token = randomBytes(24).toString('base64url');

  // Hash passcode if provided
  let passcode_hash: string | null = null;
  if (passcode) {
    passcode_hash = await bcrypt.hash(passcode, 10);
  }

  const { data: link, error } = await serviceClient
    .from('share_links')
    .insert({
      agent_id: id,
      token,
      label: label || null,
      passcode_hash,
      expires_at: expires_at || null,
      max_uses: max_uses || null,
      created_by: user.id,
    })
    .select('id, agent_id, token, label, expires_at, max_uses, use_count, revoked_at, created_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ share_link: link }, { status: 201 });
}
