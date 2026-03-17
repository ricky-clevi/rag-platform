import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { generatePublicKey } from '@/lib/security/widget-auth';
import { canonicalizeOrigin } from '@/lib/security/origin';

// GET /api/agents/[id]/widget-keys - List widget API keys for an agent
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

  const { data: keys, error } = await supabase
    .from('widget_api_keys')
    .select('id, agent_id, public_key, label, allowed_origins, rate_limit_per_minute, is_active, created_by, created_at, updated_at')
    .eq('agent_id', id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ widget_api_keys: keys });
}

// POST /api/agents/[id]/widget-keys - Create a new widget API key
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

  let body: { label?: string; allowed_origins?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { label, allowed_origins } = body;

  if (!label || typeof label !== 'string' || label.trim().length === 0) {
    return NextResponse.json({ error: 'Label is required' }, { status: 400 });
  }

  // Canonicalize and validate origins
  const canonicalizedOrigins: string[] = [];
  if (allowed_origins && Array.isArray(allowed_origins)) {
    for (const origin of allowed_origins) {
      const canonical = canonicalizeOrigin(origin);
      if (!canonical) {
        return NextResponse.json(
          { error: `Invalid origin: ${origin}` },
          { status: 400 }
        );
      }
      canonicalizedOrigins.push(canonical);
    }
  }

  const publicKey = generatePublicKey();

  const { data: key, error } = await serviceClient
    .from('widget_api_keys')
    .insert({
      agent_id: id,
      public_key: publicKey,
      label: label.trim(),
      allowed_origins: canonicalizedOrigins,
      created_by: user.id,
    })
    .select('id, agent_id, public_key, label, allowed_origins, rate_limit_per_minute, is_active, created_by, created_at, updated_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ widget_api_key: key }, { status: 201 });
}
