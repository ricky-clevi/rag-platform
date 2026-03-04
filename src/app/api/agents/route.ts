import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { addCrawlJob } from '@/lib/queue/crawl-queue';
import { generateUniqueSlug } from '@/lib/utils/slug';
import { isValidUrl, extractDomain } from '@/lib/utils/url';

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

  const body = await request.json();
  const { root_url, name, description } = body;

  if (!root_url || !isValidUrl(root_url)) {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

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

  // Start crawl job via queue
  try {
    const jobId = await addCrawlJob({
      agent_id: agent.id,
      root_url: normalizedUrl,
      user_id: user.id,
      crawl_job_id: crawlJob?.id || '',
      job_type: 'full',
    });

    return NextResponse.json({ agent, jobId }, { status: 201 });
  } catch {
    await supabase
      .from('agents')
      .update({ status: 'error', crawl_stats: { error_message: 'Job queue unavailable. Please ensure Redis is running.' } })
      .eq('id', agent.id);

    return NextResponse.json(
      { agent, error: 'Crawl job could not be queued. Is Redis running?' },
      { status: 201 }
    );
  }
}
