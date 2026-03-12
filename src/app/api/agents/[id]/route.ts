import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import bcrypt from 'bcryptjs';
import { recordAuditLog } from '@/lib/usage-logger';

// GET /api/agents/[id] - Get agent details
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const serviceClient = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: agent, error } = await serviceClient
    .from('agents')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error || !agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  // Get agent settings
  const { data: settings } = await serviceClient
    .from('agent_settings')
    .select('*')
    .eq('agent_id', id)
    .single();

  // Get page count
  const { count: pageCount } = await serviceClient
    .from('pages')
    .select('*', { count: 'exact', head: true })
    .eq('agent_id', id);

  // Get chunk count
  const { count: chunkCount } = await serviceClient
    .from('chunks')
    .select('*', { count: 'exact', head: true })
    .eq('agent_id', id);

  return NextResponse.json({
    agent,
    settings,
    stats: {
      pages: pageCount || 0,
      chunks: chunkCount || 0,
    },
  });
}

// PATCH /api/agents/[id] - Update agent
export async function PATCH(
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

  const { data: existingAgent } = await serviceClient
    .from('agents')
    .select('id, visibility')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!existingAgent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  const body = await request.json();
  const { name, description, visibility, passcode, settings } = body;

  const targetVisibility = visibility ?? existingAgent.visibility;

  // Update agent fields
  const agentUpdates: Record<string, unknown> = {};
  if (name !== undefined) agentUpdates.name = name;
  if (description !== undefined) agentUpdates.description = description;
  if (visibility !== undefined) agentUpdates.visibility = visibility;

  // Passcode protection updates.
  if (targetVisibility === 'passcode') {
    if (typeof passcode === 'string' && passcode.trim().length > 0) {
      if (passcode.trim().length < 4) {
        return NextResponse.json({ error: 'Passcode must be at least 4 characters' }, { status: 400 });
      }
      agentUpdates.passcode_hash = await bcrypt.hash(passcode.trim(), 10);
    } else {
      // Check if passcode hash already exists when enabling protection without providing new passcode
      const { data: withHash } = await serviceClient
        .from('agents')
        .select('passcode_hash')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();
      if (!withHash?.passcode_hash) {
        return NextResponse.json(
          { error: 'Passcode is required when enabling passcode protection' },
          { status: 400 }
        );
      }
    }
  } else if (visibility !== undefined && visibility !== 'passcode') {
    // Remove stale passcode when passcode protection is turned off.
    agentUpdates.passcode_hash = null;
  }

  if (Object.keys(agentUpdates).length > 0) {
    const { error } = await serviceClient
      .from('agents')
      .update(agentUpdates)
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // Update agent settings if provided
  if (settings) {
    const settingsUpdates: Record<string, unknown> = {};
    if (settings.welcome_message !== undefined) settingsUpdates.welcome_message = settings.welcome_message;
    if (settings.system_prompt !== undefined) settingsUpdates.system_prompt = settings.system_prompt;
    if (settings.starter_questions !== undefined) settingsUpdates.starter_questions = settings.starter_questions;
    if (settings.temperature !== undefined) settingsUpdates.temperature = settings.temperature;
    if (settings.max_tokens !== undefined) settingsUpdates.max_tokens = settings.max_tokens;
    if (settings.theme_color !== undefined) settingsUpdates.theme_color = settings.theme_color;
    if (settings.crawl_options !== undefined) settingsUpdates.crawl_options = settings.crawl_options;

    if (Object.keys(settingsUpdates).length > 0) {
      await serviceClient
        .from('agent_settings')
        .update(settingsUpdates)
        .eq('agent_id', id);
    }
  }

  // Fetch updated agent
  const { data: agent } = await serviceClient
    .from('agents')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  const { data: updatedSettings } = await serviceClient
    .from('agent_settings')
    .select('*')
    .eq('agent_id', id)
    .single();

  return NextResponse.json({ agent, settings: updatedSettings });
}

// DELETE /api/agents/[id] - Delete agent
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const serviceClient = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: existingAgent } = await serviceClient
    .from('agents')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!existingAgent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  const { error } = await serviceClient
    .from('agents')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  recordAuditLog({
    user_id: user.id,
    agent_id: null,
    action: 'agent_deleted',
    details: { deleted_agent_id: id },
  });

  return NextResponse.json({ success: true });
}
