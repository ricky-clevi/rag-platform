import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { recordAuditLog } from '@/lib/usage-logger';

/**
 * POST /api/webhooks/crawler (#40)
 * Worker status callbacks for crawl job progress and completion.
 */
export async function POST(request: NextRequest) {
  // Verify webhook secret (REQUIRED — reject if not configured)
  const webhookSecret = process.env.WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('WEBHOOK_SECRET is not configured — rejecting webhook request');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${webhookSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { event, agent_id, crawl_job_id, data } = body;

  if (!event || !agent_id) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const supabase = createServiceClient();

  switch (event) {
    case 'crawl.started': {
      await supabase
        .from('agents')
        .update({ status: 'crawling' })
        .eq('id', agent_id);

      if (crawl_job_id) {
        await supabase
          .from('crawl_jobs')
          .update({ status: 'running', started_at: new Date().toISOString() })
          .eq('id', crawl_job_id);
      }

      recordAuditLog({
        agent_id,
        action: 'webhook_crawl_started',
        details: { crawl_job_id },
      });
      break;
    }

    case 'crawl.progress': {
      if (crawl_job_id && data) {
        await supabase
          .from('crawl_jobs')
          .update({
            total_urls_crawled: data.pages_crawled || 0,
            total_urls_discovered: data.pages_discovered || 0,
            total_chunks_created: data.chunks_created || 0,
          })
          .eq('id', crawl_job_id);
      }
      break;
    }

    case 'crawl.completed': {
      await supabase
        .from('agents')
        .update({
          status: 'ready',
          crawl_stats: data?.stats || {},
        })
        .eq('id', agent_id);

      if (crawl_job_id) {
        await supabase
          .from('crawl_jobs')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            ...(data?.stats || {}),
          })
          .eq('id', crawl_job_id);
      }

      recordAuditLog({
        agent_id,
        action: 'webhook_crawl_completed',
        details: { crawl_job_id, stats: data?.stats },
      });
      break;
    }

    case 'crawl.failed': {
      await supabase
        .from('agents')
        .update({
          status: 'error',
          crawl_stats: { error_message: data?.error || 'Unknown error' },
        })
        .eq('id', agent_id);

      if (crawl_job_id) {
        await supabase
          .from('crawl_jobs')
          .update({
            status: 'failed',
            error_message: data?.error || 'Unknown error',
            completed_at: new Date().toISOString(),
          })
          .eq('id', crawl_job_id);
      }

      recordAuditLog({
        agent_id,
        action: 'webhook_crawl_failed',
        details: { crawl_job_id, error: data?.error },
      });
      break;
    }

    default:
      return NextResponse.json({ error: `Unknown event: ${event}` }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
