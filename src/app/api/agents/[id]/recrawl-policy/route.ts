import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/agents/[id]/recrawl-policy - Get recrawl policy
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

  const { data: agent } = await supabase
    .from('agents')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  const { data: policy } = await supabase
    .from('recrawl_policies')
    .select('*')
    .eq('agent_id', id)
    .single();

  return NextResponse.json({ policy: policy || null });
}

// PUT /api/agents/[id]/recrawl-policy - Create or update recrawl policy
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
  const { enabled, frequency_hours } = body;

  if (frequency_hours !== undefined && (frequency_hours < 1 || frequency_hours > 8760)) {
    return NextResponse.json({ error: 'frequency_hours must be between 1 and 8760' }, { status: 400 });
  }

  // Upsert policy
  const next_run_at = enabled
    ? new Date(Date.now() + (frequency_hours || 24) * 60 * 60 * 1000).toISOString()
    : null;

  const { data: policy, error } = await supabase
    .from('recrawl_policies')
    .upsert(
      {
        agent_id: id,
        enabled: enabled ?? true,
        frequency_hours: frequency_hours || 24,
        next_run_at,
      },
      { onConflict: 'agent_id' }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ policy });
}

// DELETE /api/agents/[id]/recrawl-policy - Delete recrawl policy
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { error } = await supabase
    .from('recrawl_policies')
    .delete()
    .eq('agent_id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
