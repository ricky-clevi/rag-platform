import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { DEFAULT_CHAT_MODEL, getGeminiClient } from '@/lib/gemini/client';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const serviceClient = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { agentId, prompt } = await request.json();
  if (!agentId || !prompt) {
    return NextResponse.json({ error: 'agentId and prompt are required' }, { status: 400 });
  }

  const { data: agent } = await supabase
    .from('agents')
    .select('id, name, root_url')
    .eq('id', agentId)
    .eq('user_id', user.id)
    .single();

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  const { data: pages } = await serviceClient
    .from('pages')
    .select('url, title, clean_markdown')
    .eq('agent_id', agentId)
    .eq('crawl_status', 'crawled')
    .order('last_crawled_at', { ascending: false })
    .limit(8);

  if (!pages || pages.length === 0) {
    return NextResponse.json({ error: 'No crawled content available' }, { status: 400 });
  }

  const context = pages
    .map((page, index) => `## Source ${index + 1}\nURL: ${page.url}\nTitle: ${page.title || page.url}\n${(page.clean_markdown || '').slice(0, 2800)}`)
    .join('\n\n');

  const client = getGeminiClient();
  const result = await client.models.generateContent({
    model: DEFAULT_CHAT_MODEL,
    contents: `You are helping an operator extract a focused answer from ${agent.name} (${agent.root_url}). Answer the prompt using only the provided context. If the context is incomplete, say so briefly.\n\nPrompt: ${prompt}\n\nContext:\n${context}`,
  });

  return NextResponse.json({
    answer: result.text || '',
    sources: pages.map((page) => page.url),
  });
}
