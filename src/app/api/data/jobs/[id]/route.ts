import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { buildJobMetrics } from '@/lib/job-metrics';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const serviceClient = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: job } = await serviceClient
    .from('crawl_jobs')
    .select('*')
    .eq('id', id)
    .single();

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const { data: agent } = await supabase
    .from('agents')
    .select('id, user_id, crawl_stats')
    .eq('id', job.agent_id)
    .eq('user_id', user.id)
    .single();

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  const { count: changedPages } = await serviceClient
    .from('pages')
    .select('*', { count: 'exact', head: true })
    .eq('agent_id', job.agent_id)
    .not('previous_markdown', 'is', null);

  return NextResponse.json({
    job,
    metrics: buildJobMetrics(job, agent.crawl_stats, changedPages || 0),
  });
}
