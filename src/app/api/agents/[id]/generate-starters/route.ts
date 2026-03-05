import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { generateStarterQuestions } from '@/lib/gemini/live-verification';
import { recordAuditLog } from '@/lib/usage-logger';

/**
 * POST /api/agents/[id]/generate-starters (#39)
 * Auto-generate starter questions using Gemini.
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

  // Get sample content from crawled pages
  const { data: pages } = await serviceClient
    .from('pages')
    .select('clean_markdown, title')
    .eq('agent_id', id)
    .eq('crawl_status', 'crawled')
    .order('last_crawled_at', { ascending: false })
    .limit(5);

  const sampleContent = (pages || [])
    .map((p) => `# ${p.title || 'Page'}\n${(p.clean_markdown || '').slice(0, 800)}`)
    .join('\n\n---\n\n');

  if (!sampleContent) {
    return NextResponse.json({ error: 'No crawled content available' }, { status: 400 });
  }

  const questions = await generateStarterQuestions(agent.name, agent.root_url, sampleContent);

  // Save to agent settings
  await serviceClient
    .from('agent_settings')
    .update({ starter_questions: questions })
    .eq('agent_id', id);

  recordAuditLog({
    user_id: user.id,
    agent_id: id,
    action: 'starter_questions_generated',
    details: { questions },
  });

  return NextResponse.json({ starter_questions: questions });
}
