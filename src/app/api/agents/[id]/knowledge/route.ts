import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { generateQueryEmbedding } from '@/lib/gemini/embeddings';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params;
  const searchQuery = request.nextUrl.searchParams.get('search');

  const supabase = createServiceClient();

  if (searchQuery) {
    // Semantic search across agent's knowledge
    try {
      const queryEmbedding = await generateQueryEmbedding(searchQuery);

      const { data: results } = await supabase.rpc('hybrid_search', {
        query_embedding: JSON.stringify(queryEmbedding),
        query_text: searchQuery,
        match_agent_id: agentId,
        match_count: 10,
        semantic_weight: 0.7,
        keyword_weight: 0.3,
      });

      // Get page URLs for results
      const pageIds = [...new Set(
        (results || [])
          .filter((r: { page_id?: string }) => r.page_id)
          .map((r: { page_id: string }) => r.page_id)
      )];
      const { data: pages } = pageIds.length > 0
        ? await supabase.from('pages').select('id, url').in('id', pageIds)
        : { data: [] };
      const pageMap = new Map(
        (pages || []).map((p: { id: string; url: string }) => [p.id, p.url])
      );

      return NextResponse.json({
        results: (results || []).map((r: { content: string; heading_path?: string; page_id?: string; similarity?: number }) => ({
          content: r.content,
          heading_path: r.heading_path || '',
          page_url: r.page_id ? pageMap.get(r.page_id) || '' : '',
          similarity: r.similarity || 0,
        })),
      });
    } catch (error) {
      console.error('Knowledge search failed:', error);
      return NextResponse.json({ error: 'Search failed' }, { status: 500 });
    }
  }

  // Default: return page tree
  const { data: pageList } = await supabase
    .from('pages')
    .select('id, url, title, crawl_status, language, last_crawled_at, clean_markdown')
    .eq('agent_id', agentId)
    .order('url', { ascending: true });

  return NextResponse.json({ pages: pageList || [] });
}
