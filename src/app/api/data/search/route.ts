import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { generateQueryEmbedding } from '@/lib/gemini/embeddings';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const serviceClient = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { agentId, query } = await request.json();
  if (!agentId || !query) {
    return NextResponse.json({ error: 'agentId and query are required' }, { status: 400 });
  }

  const { data: agent } = await supabase
    .from('agents')
    .select('id')
    .eq('id', agentId)
    .eq('user_id', user.id)
    .single();

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  const queryEmbedding = await generateQueryEmbedding(query);
  const { data: results } = await serviceClient.rpc('hybrid_search', {
    query_embedding: JSON.stringify(queryEmbedding),
    query_text: query,
    match_agent_id: agentId,
    match_count: 8,
    semantic_weight: 0.7,
    keyword_weight: 0.3,
  });

  const pageIds = [...new Set((results || []).map((result: { page_id?: string }) => result.page_id).filter(Boolean))];
  const { data: pages } = pageIds.length > 0
    ? await serviceClient.from('pages').select('id, url').in('id', pageIds)
    : { data: [] };
  const pageMap = new Map((pages || []).map((page: { id: string; url: string }) => [page.id, page.url]));

  return NextResponse.json({
    results: (results || []).map((result: { page_id?: string; content: string; heading_path?: string; similarity?: number }) => ({
      page_url: result.page_id ? pageMap.get(result.page_id) || '' : '',
      content: result.content,
      heading_path: result.heading_path || '',
      similarity: result.similarity || 0,
    })),
  });
}
