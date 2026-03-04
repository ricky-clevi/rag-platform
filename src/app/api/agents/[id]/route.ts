import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/agents/[id] - Get agent details
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: agent, error } = await supabase
    .from('agents')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  // Get agent settings
  const { data: settings } = await supabase
    .from('agent_settings')
    .select('*')
    .eq('agent_id', id)
    .single();

  // Get page count
  const { count: pageCount } = await supabase
    .from('pages')
    .select('*', { count: 'exact', head: true })
    .eq('agent_id', id);

  // Get chunk count
  const { count: chunkCount } = await supabase
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
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { name, description, visibility, settings } = body;

  // Update agent fields
  const agentUpdates: Record<string, unknown> = {};
  if (name !== undefined) agentUpdates.name = name;
  if (description !== undefined) agentUpdates.description = description;
  if (visibility !== undefined) agentUpdates.visibility = visibility;

  if (Object.keys(agentUpdates).length > 0) {
    const { error } = await supabase
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

    if (Object.keys(settingsUpdates).length > 0) {
      await supabase
        .from('agent_settings')
        .update(settingsUpdates)
        .eq('agent_id', id);
    }
  }

  // Fetch updated agent
  const { data: agent } = await supabase
    .from('agents')
    .select('*')
    .eq('id', id)
    .single();

  const { data: updatedSettings } = await supabase
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
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { error } = await supabase
    .from('agents')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
