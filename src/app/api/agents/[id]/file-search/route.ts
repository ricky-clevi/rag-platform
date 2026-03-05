import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getGeminiClient } from '@/lib/gemini/client';
import { recordAuditLog } from '@/lib/usage-logger';

/**
 * POST /api/agents/[id]/file-search (#37)
 * Create/sync a Gemini File Search store for optional augmentation.
 */
export async function POST(
  _request: NextRequest,
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
    .select('id, name, root_url')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  // Get all crawled pages with content
  const { data: pages } = await serviceClient
    .from('pages')
    .select('url, title, clean_markdown')
    .eq('agent_id', id)
    .eq('crawl_status', 'crawled')
    .not('clean_markdown', 'is', null);

  if (!pages || pages.length === 0) {
    return NextResponse.json({ error: 'No content available to upload' }, { status: 400 });
  }

  const client = getGeminiClient();
  const uploadResults: { url: string; title: string; status: string }[] = [];

  // Upload each page as a text file to Gemini Files API
  for (const page of pages.slice(0, 50)) { // Limit to 50 files per sync
    try {
      const content = `# ${page.title || page.url}\nSource: ${page.url}\n\n${page.clean_markdown}`;
      const blob = new Blob([content], { type: 'text/markdown' });

      const fileName = `agent-${id}-${encodeURIComponent(page.url).slice(0, 100)}.md`;

      await client.files.upload({
        file: blob,
        config: {
          displayName: page.title || page.url,
          name: fileName,
        },
      });

      uploadResults.push({
        url: page.url,
        title: page.title || page.url,
        status: 'uploaded',
      });
    } catch (error) {
      uploadResults.push({
        url: page.url,
        title: page.title || page.url,
        status: `failed: ${error instanceof Error ? error.message : 'unknown'}`,
      });
    }
  }

  const succeeded = uploadResults.filter((r) => r.status === 'uploaded').length;

  recordAuditLog({
    user_id: user.id,
    agent_id: id,
    action: 'file_search_sync',
    details: {
      total: uploadResults.length,
      succeeded,
      failed: uploadResults.length - succeeded,
    },
  });

  return NextResponse.json({
    message: `Uploaded ${succeeded}/${uploadResults.length} files to Gemini Files API`,
    note: 'Files expire after 48 hours. Supabase/pgvector remains your canonical store.',
    results: uploadResults,
  });
}
