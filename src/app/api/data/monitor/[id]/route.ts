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

  const { data: agent } = await supabase
    .from('agents')
    .select('id, crawl_stats')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  const [{ data: policy }, { data: jobs }, { count: changedPages }] = await Promise.all([
    serviceClient.from('recrawl_policies').select('*').eq('agent_id', id).single(),
    serviceClient
      .from('crawl_jobs')
      .select('id, status, job_type, total_urls_crawled, total_chunks_created, error_message, total_urls_discovered, total_urls_failed, total_urls_skipped, started_at, completed_at, created_at')
      .eq('agent_id', id)
      .order('created_at', { ascending: false })
      .limit(5),
    serviceClient
      .from('pages')
      .select('*', { count: 'exact', head: true })
      .eq('agent_id', id)
      .not('previous_markdown', 'is', null),
  ]);

  const latestJob = jobs?.[0] || null;

  return NextResponse.json({
    policy: policy || null,
    recentJobs: jobs || [],
    changedPages: changedPages || 0,
    crawlHealth: buildJobMetrics(latestJob, agent.crawl_stats, changedPages || 0),
  });
}
