import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { addCrawlJob } from '@/lib/queue/crawl-queue';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const serviceClient = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { agentId, jobType = 'full' } = await request.json();
  if (!agentId) {
    return NextResponse.json({ error: 'agentId is required' }, { status: 400 });
  }

  const { data: agent } = await supabase
    .from('agents')
    .select('id, root_url')
    .eq('id', agentId)
    .eq('user_id', user.id)
    .single();

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  const { data: crawlJob } = await serviceClient
    .from('crawl_jobs')
    .insert({
      agent_id: agentId,
      status: 'queued',
      job_type: jobType,
    })
    .select('id')
    .single();

  const jobId = await addCrawlJob({
    agent_id: agentId,
    root_url: agent.root_url,
    user_id: user.id,
    crawl_job_id: crawlJob?.id || '',
    job_type: jobType,
  });

  return NextResponse.json({ jobId, crawlJobId: crawlJob?.id || '' });
}
