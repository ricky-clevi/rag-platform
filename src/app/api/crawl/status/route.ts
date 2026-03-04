import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/crawl/status?agent_id=xxx - Get crawl status
export async function GET(request: NextRequest) {
  const agentId = request.nextUrl.searchParams.get('agent_id');

  if (!agentId) {
    return NextResponse.json({ error: 'agent_id required' }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: agent } = await supabase
    .from('agents')
    .select('id, status, crawl_stats, name')
    .eq('id', agentId)
    .single();

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  return NextResponse.json({
    status: agent.status,
    crawl_stats: agent.crawl_stats,
    name: agent.name,
  });
}
