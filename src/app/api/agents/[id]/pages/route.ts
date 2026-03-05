import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/agents/[id]/pages - List crawled pages for an agent
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Verify ownership
  const { data: agent } = await supabase
    .from('agents')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  // Pagination
  const page = parseInt(request.nextUrl.searchParams.get('page') || '1');
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '50'), 100);
  const offset = (page - 1) * limit;
  const status = request.nextUrl.searchParams.get('status');

  let query = supabase
    .from('pages')
    .select('id, url, canonical_url, title, language, status_code, etag, content_hash, robots_allowed, page_type, crawl_status, skip_reason, raw_html_length, last_crawled_at, created_at', { count: 'exact' })
    .eq('agent_id', id)
    .order('last_crawled_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) {
    query = query.eq('crawl_status', status);
  }

  const { data: pages, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    pages,
    pagination: {
      page,
      limit,
      total: count || 0,
      total_pages: Math.ceil((count || 0) / limit),
    },
  });
}
