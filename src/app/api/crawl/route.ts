import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { addCrawlJob } from '@/lib/queue/crawl-queue';
import { ensureCrawlReady } from '@/lib/queue/readiness';
import { runDirectCrawl } from '@/lib/queue/direct-crawl';
import { checkRateLimit, getClientIp, RATE_LIMITS } from '@/lib/rate-limiter';

// POST /api/crawl - Re-trigger crawl for an agent
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const serviceClient = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Rate limit crawl triggers
  const ip = getClientIp(request);
  const rateResult = checkRateLimit(`crawl:${ip}`, RATE_LIMITS.crawlTrigger);
  if (!rateResult.allowed) {
    return NextResponse.json(
      { error: 'Too many crawl requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rateResult.retryAfterMs || 3600000) / 1000)) } }
    );
  }

  const { agent_id, job_type = 'full', ignore_robots } = await request.json();

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

  // Check crawl infrastructure (Redis or direct mode)
  const crawlReady = await ensureCrawlReady();

  // For full recrawl, clear existing data
  if (job_type === 'full') {
    await serviceClient.from('chunks').delete().eq('agent_id', agent_id);
    await serviceClient.from('pages').delete().eq('agent_id', agent_id);
  }

  // Reset agent status
  await supabase
    .from('agents')
    .update({ status: 'pending', crawl_stats: {} })
    .eq('id', agent_id);

  // Create a crawl job record
  const { data: crawlJob } = await serviceClient
    .from('crawl_jobs')
    .insert({
      agent_id,
      status: 'queued',
      job_type: job_type as 'full' | 'incremental' | 'single_page',
    })
    .select('id')
    .single();

  // Queue or direct-execute crawl
  const crawlData = {
    agent_id,
    root_url: agent.root_url,
    user_id: user.id,
    crawl_job_id: crawlJob?.id || '',
    job_type: job_type as 'full' | 'incremental' | 'single_page',
    ignore_robots: ignore_robots || false,
  };

  let jobId: string;
  if (crawlReady.mode === 'redis') {
    try {
      jobId = await addCrawlJob(crawlData);
    } catch {
      runDirectCrawl(crawlData);
      jobId = `direct-${agent_id}`;
    }
  } else {
    runDirectCrawl(crawlData);
    jobId = `direct-${agent_id}`;
  }

  return NextResponse.json({ jobId });
}
