/**
 * Scheduled recrawl worker (#25).
 * Runs on a regular interval, checks for due recrawl policies,
 * and enqueues incremental crawl jobs.
 *
 * Run with: npx tsx workers/recrawl-scheduler.ts
 */

import './load-env';
import { createClient } from '@supabase/supabase-js';
import { Queue } from 'bullmq';
import { getRedisConnectionOpts } from '../src/lib/queue/connection';

const POLL_INTERVAL_MS = 60_000; // Check every minute

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing Supabase environment variables');
  }
  return createClient(url, key);
}

async function checkAndTriggerRecrawls() {
  const supabase = getSupabaseClient();
  const crawlQueue = new Queue('crawl', { connection: getRedisConnectionOpts() });

  try {
    // Find all enabled policies where next_run_at is in the past
    const { data: duePolicies, error } = await supabase
      .from('recrawl_policies')
      .select('id, agent_id, frequency_hours')
      .eq('enabled', true)
      .lte('next_run_at', new Date().toISOString());

    if (error) {
      console.error('Error fetching recrawl policies:', error);
      return;
    }

    if (!duePolicies || duePolicies.length === 0) {
      return;
    }

    console.log(`Found ${duePolicies.length} due recrawl policies`);

    for (const policy of duePolicies) {
      try {
        // Get agent details
        const { data: agent } = await supabase
          .from('agents')
          .select('id, root_url, user_id, status')
          .eq('id', policy.agent_id)
          .single();

        if (!agent || agent.status === 'crawling') {
          console.log(`Skipping agent ${policy.agent_id}: ${agent?.status || 'not found'}`);
          continue;
        }

        // Create crawl job record
        const { data: crawlJob } = await supabase
          .from('crawl_jobs')
          .insert({
            agent_id: agent.id,
            status: 'queued',
            job_type: 'incremental',
          })
          .select('id')
          .single();

        // Enqueue the crawl job
        await crawlQueue.add(
          `crawl-${agent.id}-scheduled`,
          {
            agent_id: agent.id,
            root_url: agent.root_url,
            user_id: agent.user_id,
            crawl_job_id: crawlJob?.id || '',
            job_type: 'incremental' as const,
          },
          {
            jobId: `crawl-${agent.id}-${Date.now()}`,
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
            removeOnComplete: { count: 100 },
            removeOnFail: { count: 50 },
          }
        );

        // Update the policy: set last_run_at and next_run_at
        const nextRunAt = new Date(
          Date.now() + policy.frequency_hours * 60 * 60 * 1000
        ).toISOString();

        await supabase
          .from('recrawl_policies')
          .update({
            last_run_at: new Date().toISOString(),
            next_run_at: nextRunAt,
          })
          .eq('id', policy.id);

        // Record audit log
        await supabase.from('audit_logs').insert({
          agent_id: agent.id,
          action: 'scheduled_recrawl_triggered',
          details: { frequency_hours: policy.frequency_hours, crawl_job_id: crawlJob?.id },
        });

        console.log(`Triggered recrawl for agent ${agent.id}, next run at ${nextRunAt}`);
      } catch (agentError) {
        console.error(`Failed to trigger recrawl for agent ${policy.agent_id}:`, agentError);
      }
    }
  } finally {
    await crawlQueue.close();
  }
}

async function runScheduler() {
  console.log('Recrawl scheduler started');
  console.log(`Polling interval: ${POLL_INTERVAL_MS}ms`);

  // Initial check
  await checkAndTriggerRecrawls();

  // Then poll at interval
  const intervalId = setInterval(async () => {
    try {
      await checkAndTriggerRecrawls();
    } catch (error) {
      console.error('Scheduler error:', error);
    }
  }, POLL_INTERVAL_MS);

  // Graceful shutdown
  const shutdown = () => {
    console.log('Recrawl scheduler shutting down...');
    clearInterval(intervalId);
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

runScheduler().catch(console.error);
