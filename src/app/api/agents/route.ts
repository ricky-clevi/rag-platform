import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { addCrawlJob } from '@/lib/queue/crawl-queue';
import { ensureCrawlReady } from '@/lib/queue/readiness';
import { runDirectCrawl } from '@/lib/queue/direct-crawl';
import { generateUniqueSlug } from '@/lib/utils/slug';
import { isValidUrl, extractDomain } from '@/lib/utils/url';
import { recordAuditLog, recordUsageEvent } from '@/lib/usage-logger';
import { checkRateLimit, getClientIp, RATE_LIMITS } from '@/lib/rate-limiter';

// GET /api/agents - List user's agents
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: agents, error } = await supabase
    .from('agents')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ agents });
}

// POST /api/agents - Create a new agent and start crawling
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const serviceClient = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Rate limiting (#13)
  const ip = getClientIp(request);
  const rateResult = checkRateLimit(`agent-create:${ip}`, RATE_LIMITS.agentCreation);
  if (!rateResult.allowed) {
    return NextResponse.json(
      { error: 'Too many agent creation requests' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rateResult.retryAfterMs || 60000) / 1000)) } }
    );
  }

  // Quota enforcement (#35)
  const { data: membership } = await supabase
    .from('memberships')
    .select('org_id, organizations(quota_agents)')
    .eq('user_id', user.id)
    .limit(1)
    .single();

  if (membership?.organizations) {
    const org = membership.organizations as { quota_agents?: number };
    if (org.quota_agents && org.quota_agents > 0) {
      const { count: agentCount } = await supabase
        .from('agents')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);
      if (agentCount && agentCount >= org.quota_agents) {
        return NextResponse.json(
          { error: `Agent quota reached (${org.quota_agents}). Upgrade your plan.` },
          { status: 403 }
        );
      }
    }
  }

  const body = await request.json();
  const { root_url, name, description, max_depth, max_pages, include_paths, exclude_paths, ignore_robots } = body;

  if (!root_url || !isValidUrl(root_url)) {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  // Check crawl infrastructure (Redis or direct mode)
  const crawlReady = await ensureCrawlReady();

  const domain = extractDomain(root_url);
  const agentName = name || domain;
  const slug = generateUniqueSlug(agentName);
  const normalizedUrl = root_url.startsWith('http') ? root_url : `https://${root_url}`;

  // Create the agent
  const { data: agent, error } = await supabase
    .from('agents')
    .insert({
      user_id: user.id,
      name: agentName,
      slug,
      description: description || `AI agent for ${domain}`,
      root_url: normalizedUrl,
      status: 'pending',
      primary_locale: 'en',
      enabled_locales: ['en'],
      visibility: 'public',
      crawl_stats: {},
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Create a crawl job record
  const { data: crawlJob } = await serviceClient
    .from('crawl_jobs')
    .insert({
      agent_id: agent.id,
      status: 'queued',
      job_type: 'full',
    })
    .select('id')
    .single();

  // Start crawl job
  const crawlData = {
    agent_id: agent.id,
    root_url: normalizedUrl,
    user_id: user.id,
    crawl_job_id: crawlJob?.id || '',
    job_type: 'full' as const,
    max_depth: max_depth || 5,
    max_pages: max_pages || 500,
    include_paths: include_paths || [],
    exclude_paths: exclude_paths || [],
    ignore_robots: ignore_robots || false,
  };

  let jobId: string;
  if (crawlReady.mode === 'redis') {
    try {
      jobId = await addCrawlJob(crawlData);
    } catch {
      // Redis failed after readiness check — fall back to direct
      runDirectCrawl(crawlData);
      jobId = `direct-${agent.id}`;
    }
  } else {
    runDirectCrawl(crawlData);
    jobId = `direct-${agent.id}`;
  }

  // Audit log & usage event (#24)
  recordAuditLog({
    user_id: user.id,
    agent_id: agent.id,
    action: 'agent_created',
    details: { name: agent.name, root_url: normalizedUrl },
  });
  recordUsageEvent({
    agent_id: agent.id,
    event_type: 'agent_created',
    metadata: { user_id: user.id },
  });

  return NextResponse.json({ agent, jobId }, { status: 201 });
}
