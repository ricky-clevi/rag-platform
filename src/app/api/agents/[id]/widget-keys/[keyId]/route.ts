import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { canonicalizeOrigin } from '@/lib/security/origin';

// PATCH /api/agents/[id]/widget-keys/[keyId] - Update a widget API key
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; keyId: string }> }
) {
  const { id: agentId, keyId } = await params;
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
    .eq('id', agentId)
    .eq('user_id', user.id)
    .single();

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  let body: { label?: string; allowed_origins?: string[]; rate_limit_per_minute?: number; is_active?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { label, allowed_origins, rate_limit_per_minute, is_active } = body;

  const updates: Record<string, unknown> = {};

  if (label !== undefined) {
    if (typeof label !== 'string' || label.trim().length === 0) {
      return NextResponse.json({ error: 'Label must be a non-empty string' }, { status: 400 });
    }
    updates.label = label.trim();
  }

  if (allowed_origins !== undefined) {
    if (!Array.isArray(allowed_origins)) {
      return NextResponse.json({ error: 'allowed_origins must be an array' }, { status: 400 });
    }
    const canonicalized: string[] = [];
    for (const origin of allowed_origins) {
      const canonical = canonicalizeOrigin(origin);
      if (!canonical) {
        return NextResponse.json(
          { error: `Invalid origin: ${origin}` },
          { status: 400 }
        );
      }
      canonicalized.push(canonical);
    }
    updates.allowed_origins = canonicalized;
  }

  if (rate_limit_per_minute !== undefined) {
    if (typeof rate_limit_per_minute !== 'number' || rate_limit_per_minute < 1) {
      return NextResponse.json({ error: 'rate_limit_per_minute must be a positive number' }, { status: 400 });
    }
    updates.rate_limit_per_minute = rate_limit_per_minute;
  }

  if (is_active !== undefined) {
    if (typeof is_active !== 'boolean') {
      return NextResponse.json({ error: 'is_active must be a boolean' }, { status: 400 });
    }
    updates.is_active = is_active;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const { data: key, error } = await serviceClient
    .from('widget_api_keys')
    .update(updates)
    .eq('id', keyId)
    .eq('agent_id', agentId)
    .select('id, agent_id, public_key, label, allowed_origins, rate_limit_per_minute, is_active, created_by, created_at, updated_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!key) {
    return NextResponse.json({ error: 'Widget API key not found' }, { status: 404 });
  }

  return NextResponse.json({ widget_api_key: key });
}

// DELETE /api/agents/[id]/widget-keys/[keyId] - Delete a widget API key
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; keyId: string }> }
) {
  const { id: agentId, keyId } = await params;
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
    .eq('id', agentId)
    .eq('user_id', user.id)
    .single();

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  const { error } = await serviceClient
    .from('widget_api_keys')
    .delete()
    .eq('id', keyId)
    .eq('agent_id', agentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
