import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
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
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { website_url, name, description } = body;

  if (!website_url || !isValidUrl(website_url)) {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  const domain = extractDomain(website_url);
  const agentName = name || domain;
  const slug = generateUniqueSlug(agentName);

  // Create the agent
  const { data: agent, error } = await supabase
    .from('agents')
    .insert({
      user_id: user.id,
      name: agentName,
      slug,
      description: description || `AI agent for ${domain}`,
      website_url: website_url.startsWith('http') ? website_url : `https://${website_url}`,
      status: 'pending',
      settings: {
        welcome_message: `Hello! I'm an AI assistant with knowledge about ${domain}. Ask me anything!`,
      },
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Start crawl job
  try {
    const jobId = await addCrawlJob({
      agent_id: agent.id,
      website_url: agent.website_url,
      user_id: user.id,
    });

    return NextResponse.json({ agent, jobId }, { status: 201 });
  } catch {
    // If queue is not available, update status to error
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
