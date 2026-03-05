import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

/**
 * GET /api/agents/[id]/diff?page_id=xxx (#26)
 * Returns content diff for a page between current and previous crawl.
 */
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

  const { data: agent } = await supabase
    .from('agents')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  const pageId = request.nextUrl.searchParams.get('page_id');
  if (!pageId) {
    return NextResponse.json({ error: 'page_id required' }, { status: 400 });
  }

  const serviceClient = createServiceClient();
  const { data: page } = await serviceClient
    .from('pages')
    .select('id, url, title, clean_markdown, previous_markdown, last_crawled_at, content_hash')
    .eq('id', pageId)
    .eq('agent_id', id)
    .single();

  if (!page) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 });
  }

  // Simple line-based diff
  const currentLines = (page.clean_markdown || '').split('\n');
  const previousLines = (page.previous_markdown || '').split('\n');

  const diff: { type: 'added' | 'removed' | 'unchanged'; line: string }[] = [];

  const maxLen = Math.max(currentLines.length, previousLines.length);
  for (let i = 0; i < maxLen; i++) {
    const cur = currentLines[i] || '';
    const prev = previousLines[i] || '';
    if (cur === prev) {
      if (cur) diff.push({ type: 'unchanged', line: cur });
    } else {
      if (prev) diff.push({ type: 'removed', line: prev });
      if (cur) diff.push({ type: 'added', line: cur });
    }
  }

  return NextResponse.json({
    page: {
      id: page.id,
      url: page.url,
      title: page.title,
      last_crawled_at: page.last_crawled_at,
    },
    has_previous: !!page.previous_markdown,
    diff,
    stats: {
      added: diff.filter((d) => d.type === 'added').length,
      removed: diff.filter((d) => d.type === 'removed').length,
      unchanged: diff.filter((d) => d.type === 'unchanged').length,
    },
  });
}
