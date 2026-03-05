import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/agents/[id]/domains - List domains for an agent
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

  const { data: domains, error } = await supabase
    .from('agent_domains')
    .select('*')
    .eq('agent_id', id)
    .order('is_primary', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ domains });
}

// POST /api/agents/[id]/domains - Add a domain to an agent
export async function POST(
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
  const { domain, is_primary = false } = body;

  if (!domain) {
    return NextResponse.json({ error: 'domain is required' }, { status: 400 });
  }

  // If setting as primary, unset others first
  if (is_primary) {
    await supabase
      .from('agent_domains')
      .update({ is_primary: false })
      .eq('agent_id', id);
  }

  const { data: newDomain, error } = await supabase
    .from('agent_domains')
    .insert({
      agent_id: id,
      domain,
      is_primary,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ domain: newDomain }, { status: 201 });
}

// DELETE /api/agents/[id]/domains - Remove a domain
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { domain_id } = await request.json();

  if (!domain_id) {
    return NextResponse.json({ error: 'domain_id is required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('agent_domains')
    .delete()
    .eq('id', domain_id)
    .eq('agent_id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
