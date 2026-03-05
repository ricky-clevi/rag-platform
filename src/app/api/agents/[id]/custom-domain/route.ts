import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { recordAuditLog } from '@/lib/usage-logger';

/**
 * GET /api/agents/[id]/custom-domain (#30)
 * Get custom domain configuration.
 */
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
    .select('id, custom_domain, custom_domain_verified')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  return NextResponse.json({
    custom_domain: agent.custom_domain,
    verified: agent.custom_domain_verified,
  });
}

/**
 * PUT /api/agents/[id]/custom-domain (#30)
 * Set or update custom domain.
 */
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
  const { custom_domain } = body;

  if (!custom_domain) {
    return NextResponse.json({ error: 'custom_domain required' }, { status: 400 });
  }

  // Basic domain validation
  const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,}$/;
  if (!domainRegex.test(custom_domain)) {
    return NextResponse.json({ error: 'Invalid domain format' }, { status: 400 });
  }

  // Check uniqueness
  const { data: existing } = await supabase
    .from('agents')
    .select('id')
    .eq('custom_domain', custom_domain)
    .neq('id', id)
    .single();

  if (existing) {
    return NextResponse.json({ error: 'Domain already in use' }, { status: 409 });
  }

  const { error } = await supabase
    .from('agents')
    .update({
      custom_domain,
      custom_domain_verified: false, // Needs DNS verification
    })
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  recordAuditLog({
    user_id: user.id,
    agent_id: id,
    action: 'custom_domain_set',
    details: { custom_domain },
  });

  return NextResponse.json({
    custom_domain,
    verified: false,
    dns_instructions: {
      type: 'CNAME',
      name: custom_domain,
      value: process.env.NEXT_PUBLIC_APP_URL
        ? new URL(process.env.NEXT_PUBLIC_APP_URL).hostname
        : 'your-app.vercel.app',
      note: 'Add this CNAME record to your DNS provider, then verify.',
    },
  });
}

/**
 * DELETE /api/agents/[id]/custom-domain (#30)
 * Remove custom domain.
 */
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
    .from('agents')
    .update({ custom_domain: null, custom_domain_verified: false })
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  recordAuditLog({
    user_id: user.id,
    agent_id: id,
    action: 'custom_domain_removed',
  });

  return NextResponse.json({ ok: true });
}
