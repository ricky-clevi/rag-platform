import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

/**
 * GET /api/agents/[id]/analytics (#22)
 * Returns analytics data for the agent dashboard.
 */
export async function GET(
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

  const days = parseInt(request.nextUrl.searchParams.get('days') || '30');

  // Get analytics from RPC function
  const { data: analytics } = await serviceClient.rpc('get_agent_analytics', {
    p_agent_id: id,
    p_days: days,
  });

  // Get usage events summary
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data: usageEvents } = await serviceClient
    .from('usage_events')
    .select('event_type, metadata, created_at')
    .eq('agent_id', id)
    .gte('created_at', startDate)
    .order('created_at', { ascending: false })
    .limit(100);

  // Aggregate usage by type
  const usageSummary: Record<string, number> = {};
  for (const event of usageEvents || []) {
    usageSummary[event.event_type] = (usageSummary[event.event_type] || 0) + 1;
  }

  // Get recent conversations
  const { data: recentConversations } = await serviceClient
    .from('conversations')
    .select('id, title, message_count, created_at, session_id')
    .eq('agent_id', id)
    .order('created_at', { ascending: false })
    .limit(10);

  // Get crawl history
  const { data: crawlHistory } = await serviceClient
    .from('crawl_jobs')
    .select('id, status, job_type, total_urls_crawled, total_chunks_created, started_at, completed_at')
    .eq('agent_id', id)
    .order('created_at', { ascending: false })
    .limit(10);

  // Get model usage stats
  const { data: modelUsage } = await serviceClient
    .from('messages')
    .select('model_used')
    .eq('role', 'assistant')
    .in('conversation_id',
      (recentConversations || []).map((c) => c.id)
    );

  const modelCounts: Record<string, number> = {};
  for (const msg of modelUsage || []) {
    if (msg.model_used) {
      modelCounts[msg.model_used] = (modelCounts[msg.model_used] || 0) + 1;
    }
  }

  const analyticsRow = Array.isArray(analytics) ? analytics[0] : analytics;

  return NextResponse.json({
    summary: {
      total_conversations: analyticsRow?.total_conversations || 0,
      total_messages: analyticsRow?.total_messages || 0,
      avg_confidence: analyticsRow?.avg_confidence || 0,
      low_confidence_count: analyticsRow?.low_confidence_count || 0,
      unique_sessions: analyticsRow?.unique_sessions || 0,
    },
    messages_by_day: analyticsRow?.messages_by_day || [],
    usage_summary: usageSummary,
    recent_conversations: recentConversations || [],
    crawl_history: crawlHistory || [],
    model_usage: modelCounts,
  });
}
