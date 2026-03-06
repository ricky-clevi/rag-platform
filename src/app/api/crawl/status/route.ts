import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { buildJobMetrics } from '@/lib/job-metrics';

// GET /api/crawl/status?agent_id=xxx - Get crawl status (authenticated)
export async function GET(request: NextRequest) {
  const agentId = request.nextUrl.searchParams.get('agent_id');

  if (!agentId) {
    return NextResponse.json({ error: 'agent_id required' }, { status: 400 });
  }

  const supabase = await createClient();
  const serviceClient = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: agent } = await supabase
    .from('agents')
    .select('id, status, crawl_stats, name')
    .eq('id', agentId)
    .eq('user_id', user.id)
    .single();

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  const [{ data: latestJob }, { count: changedPages }] = await Promise.all([
    serviceClient
      .from('crawl_jobs')
      .select('*')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    serviceClient
      .from('pages')
      .select('*', { count: 'exact', head: true })
      .eq('agent_id', agentId)
      .not('previous_markdown', 'is', null),
  ]);

  return NextResponse.json({
    status: agent.status,
    crawl_stats: agent.crawl_stats,
    name: agent.name,
    metrics: buildJobMetrics(latestJob, agent.crawl_stats, changedPages || 0),
  });
}
