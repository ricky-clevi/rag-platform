import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { addCrawlJob } from '@/lib/queue/crawl-queue';

// POST /api/crawl - Re-trigger crawl for an agent
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { agent_id } = await request.json();

  if (!agent_id) {
    return NextResponse.json({ error: 'agent_id required' }, { status: 400 });
  }

  // Verify ownership
  const { data: agent } = await supabase
    .from('agents')
    .select('*')
    .eq('id', agent_id)
    .eq('user_id', user.id)
    .single();

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  // Clear existing data
  await supabase.from('documents').delete().eq('agent_id', agent_id);
  await supabase.from('pages').delete().eq('agent_id', agent_id);

  // Reset status
  await supabase
    .from('agents')
    .update({ status: 'pending', crawl_stats: {} })
    .eq('id', agent_id);

  // Queue new crawl
  const jobId = await addCrawlJob({
    agent_id,
    website_url: agent.website_url,
    user_id: user.id,
  });

  return NextResponse.json({ jobId });
}
