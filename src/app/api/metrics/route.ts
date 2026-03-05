import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * GET /api/metrics (#45)
 * Prometheus-compatible metrics endpoint.
 */
export async function GET() {
  // Verify metrics access (optional auth check)
  const metricsKey = process.env.METRICS_API_KEY;

  const supabase = createServiceClient();

  // Gather metrics
  const [
    { count: agentCount },
    { count: readyAgentCount },
    { count: conversationCount },
    { count: messageCount },
    { count: chunkCount },
    { count: pageCount },
    { count: crawlJobCount },
  ] = await Promise.all([
    supabase.from('agents').select('*', { count: 'exact', head: true }),
    supabase.from('agents').select('*', { count: 'exact', head: true }).eq('status', 'ready'),
    supabase.from('conversations').select('*', { count: 'exact', head: true }),
    supabase.from('messages').select('*', { count: 'exact', head: true }),
    supabase.from('chunks').select('*', { count: 'exact', head: true }),
    supabase.from('pages').select('*', { count: 'exact', head: true }),
    supabase.from('crawl_jobs').select('*', { count: 'exact', head: true }).eq('status', 'running'),
  ]);

  // Get recent usage events count (last hour)
  const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
  const { count: recentChatEvents } = await supabase
    .from('usage_events')
    .select('*', { count: 'exact', head: true })
    .eq('event_type', 'chat')
    .gte('created_at', oneHourAgo);

  // Format as Prometheus text exposition
  const metrics = [
    '# HELP ragplatform_agents_total Total number of agents',
    '# TYPE ragplatform_agents_total gauge',
    `ragplatform_agents_total ${agentCount || 0}`,
    '',
    '# HELP ragplatform_agents_ready Number of ready agents',
    '# TYPE ragplatform_agents_ready gauge',
    `ragplatform_agents_ready ${readyAgentCount || 0}`,
    '',
    '# HELP ragplatform_conversations_total Total conversations',
    '# TYPE ragplatform_conversations_total gauge',
    `ragplatform_conversations_total ${conversationCount || 0}`,
    '',
    '# HELP ragplatform_messages_total Total messages',
    '# TYPE ragplatform_messages_total gauge',
    `ragplatform_messages_total ${messageCount || 0}`,
    '',
    '# HELP ragplatform_chunks_total Total indexed chunks',
    '# TYPE ragplatform_chunks_total gauge',
    `ragplatform_chunks_total ${chunkCount || 0}`,
    '',
    '# HELP ragplatform_pages_total Total crawled pages',
    '# TYPE ragplatform_pages_total gauge',
    `ragplatform_pages_total ${pageCount || 0}`,
    '',
    '# HELP ragplatform_crawl_jobs_active Currently running crawl jobs',
    '# TYPE ragplatform_crawl_jobs_active gauge',
    `ragplatform_crawl_jobs_active ${crawlJobCount || 0}`,
    '',
    '# HELP ragplatform_chat_requests_1h Chat requests in last hour',
    '# TYPE ragplatform_chat_requests_1h gauge',
    `ragplatform_chat_requests_1h ${recentChatEvents || 0}`,
    '',
  ].join('\n');

  return new NextResponse(metrics, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
