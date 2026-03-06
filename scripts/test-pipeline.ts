/**
 * End-to-end pipeline test: crawl → embed → store → search → chat
 *
 * Usage: npx tsx scripts/test-pipeline.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { executeCrawlJob } from '../src/lib/queue/worker';
import { generateQueryEmbedding } from '../src/lib/gemini/embeddings';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Get user_id from existing agents or auth.users
async function getUserId(): Promise<string> {
  const { data } = await supabase.from('agents').select('user_id').limit(1).single();
  if (data?.user_id) return data.user_id;
  // Fallback: query auth.users via RPC or hardcode from earlier check
  throw new Error('No user found in database. Create a user first.');
}

interface SiteConfig {
  name: string;
  root_url: string;
  question: string;
}

const SITES: SiteConfig[] = [
  { name: 'Across Waves', root_url: 'http://across-waves.com', question: 'What products does Across Waves provide?' },
  { name: 'Clevi AI', root_url: 'https://clevi.ai', question: 'What is Clevi AI?' },
  { name: 'GeoSoft', root_url: 'https://geosoft.co.kr', question: '지오소프트는 어떤 회사인가요?' },
  { name: 'Abdurashid Akbarov (Portfolio)', root_url: 'https://abdurashid.com', question: "Tell me about Abdurashid's projects" },
  { name: 'Doston Law', root_url: 'https://doston-law.netlify.app/', question: 'What legal services does Doston Law offer?' },
];

function log(icon: string, msg: string) {
  console.log(`  ${icon} ${msg}`);
}

async function findAgent(root_url: string) {
  // Normalize: match with or without trailing slash
  const normalized = root_url.replace(/\/$/, '');
  const { data } = await supabase
    .from('agents')
    .select('id, name, slug, root_url, status')
    .or(`root_url.eq.${root_url},root_url.eq.${normalized},root_url.eq.${normalized}/`);
  return data?.[0] || null;
}

async function createAgent(site: SiteConfig, userId: string): Promise<string> {
  const slug = site.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Math.random().toString(36).slice(2, 10);

  const { data: agent, error } = await supabase
    .from('agents')
    .insert({
      user_id: userId,
      name: site.name,
      slug,
      root_url: site.root_url,
      status: 'draft',
      primary_locale: 'en',
      enabled_locales: ['en'],
      visibility: 'public',
      crawl_stats: {},
    })
    .select('id')
    .single();

  if (error || !agent) throw new Error(`Failed to create agent: ${error?.message}`);

  // Create agent_settings
  await supabase.from('agent_settings').insert({
    agent_id: agent.id,
    starter_questions: [site.question],
    temperature: 0.3,
    max_tokens: 1024,
    default_model: 'gemini-3.1-flash-lite-preview',
    escalation_model: 'gemini-2.0-flash',
    escalation_threshold: 0.3,
    theme_color: '#2563eb',
  });

  return agent.id;
}

async function runCrawl(agentId: string, site: SiteConfig, userId: string): Promise<void> {
  // Create crawl_job record
  const { data: crawlJob, error } = await supabase
    .from('crawl_jobs')
    .insert({
      agent_id: agentId,
      status: 'queued',
      job_type: 'full',
    })
    .select('id')
    .single();

  if (error || !crawlJob) throw new Error(`Failed to create crawl_job: ${error?.message}`);

  await executeCrawlJob({
    agent_id: agentId,
    root_url: site.root_url,
    crawl_job_id: crawlJob.id,
    job_type: 'full',
    user_id: userId,
  });
}

async function testSearch(agentId: string, question: string): Promise<boolean> {
  const embedding = await generateQueryEmbedding(question);

  const { data, error } = await supabase.rpc('hybrid_search', {
    query_embedding: JSON.stringify(embedding),
    query_text: question,
    match_agent_id: agentId,
    match_count: 5,
    semantic_weight: 0.7,
    keyword_weight: 0.3,
  });

  if (error) {
    log('FAIL', `Search error: ${error.message}`);
    return false;
  }

  if (!data || data.length === 0) {
    log('FAIL', 'Search returned 0 results');
    return false;
  }

  log('PASS', `Search returned ${data.length} results (top similarity: ${data[0].similarity?.toFixed(3)})`);
  return true;
}

async function testChat(agentId: string, question: string): Promise<boolean> {
  const sessionId = `test-${Date.now()}`;

  const response = await fetch(`${APP_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    },
    body: JSON.stringify({
      agent_id: agentId,
      message: question,
      session_id: sessionId,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    log('FAIL', `Chat HTTP ${response.status}: ${errText}`);
    return false;
  }

  const text = await response.text();
  const lines = text.split('\n').filter((l) => l.startsWith('data: '));

  let hasText = false;
  let hasSources = false;
  let hasDone = false;
  let textContent = '';

  for (const line of lines) {
    const payload = line.slice(6); // Remove "data: "
    if (payload === '[DONE]') {
      hasDone = true;
      continue;
    }
    try {
      const parsed = JSON.parse(payload);
      if (parsed.type === 'text') {
        hasText = true;
        textContent += parsed.content;
      }
      if (parsed.type === 'sources') {
        hasSources = true;
        log('PASS', `Chat sources: ${parsed.sources?.length || 0} citations`);
      }
      if (parsed.type === 'error') {
        log('FAIL', `Chat stream error: ${parsed.content}`);
        return false;
      }
    } catch {
      // skip non-JSON lines
    }
  }

  if (!hasText || !textContent) {
    log('FAIL', 'Chat returned no text content');
    return false;
  }

  log('PASS', `Chat response: ${textContent.slice(0, 100).replace(/\n/g, ' ')}...`);

  if (!hasSources) log('WARN', 'No sources block in response');
  if (!hasDone) log('WARN', 'No [DONE] marker in response');

  return hasText;
}

async function testSite(site: SiteConfig, userId: string): Promise<boolean> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${site.name} (${site.root_url})`);
  console.log('='.repeat(60));

  let agentId: string;
  let needsCrawl = false;

  // Check if agent exists
  const existing = await findAgent(site.root_url);
  if (existing) {
    agentId = existing.id;
    log('OK', `Agent exists: ${existing.slug} (status: ${existing.status})`);
    if (existing.status !== 'ready') {
      needsCrawl = true;
    }
  } else {
    log('...', 'Creating agent...');
    agentId = await createAgent(site, userId);
    needsCrawl = true;
    log('OK', `Agent created: ${agentId}`);
  }

  // Check page/chunk counts
  const { count: pageCount } = await supabase
    .from('pages')
    .select('*', { count: 'exact', head: true })
    .eq('agent_id', agentId)
    .eq('crawl_status', 'crawled');

  const { count: chunkCount } = await supabase
    .from('chunks')
    .select('*', { count: 'exact', head: true })
    .eq('agent_id', agentId);

  log('INFO', `Current data: ${pageCount || 0} pages, ${chunkCount || 0} chunks`);

  if (needsCrawl || (chunkCount || 0) === 0) {
    log('...', 'Starting crawl (this may take a few minutes)...');
    const startTime = Date.now();
    try {
      await runCrawl(agentId, site, userId);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      log('PASS', `Crawl completed in ${elapsed}s`);
    } catch (err) {
      log('FAIL', `Crawl failed: ${err instanceof Error ? err.message : err}`);
      return false;
    }

    // Re-check counts
    const { count: newPages } = await supabase
      .from('pages')
      .select('*', { count: 'exact', head: true })
      .eq('agent_id', agentId)
      .eq('crawl_status', 'crawled');
    const { count: newChunks } = await supabase
      .from('chunks')
      .select('*', { count: 'exact', head: true })
      .eq('agent_id', agentId);
    log('OK', `After crawl: ${newPages || 0} pages, ${newChunks || 0} chunks`);

    if ((newChunks || 0) === 0) {
      log('FAIL', 'No chunks created after crawl');
      return false;
    }
  } else {
    log('SKIP', 'Crawl skipped (agent already ready with chunks)');
  }

  // Test search
  log('...', 'Testing hybrid search...');
  const searchOk = await testSearch(agentId, site.question);

  // Test chat
  log('...', 'Testing chat endpoint...');
  const chatOk = await testChat(agentId, site.question);

  const allPassed = searchOk && chatOk;
  console.log(`\n  Result: ${allPassed ? 'ALL PASSED' : 'SOME FAILURES'}`);
  return allPassed;
}

async function main() {
  console.log('AgentForge End-to-End Pipeline Test');
  console.log('='.repeat(60));
  console.log(`Supabase: ${SUPABASE_URL}`);
  console.log(`App:      ${APP_URL}`);
  console.log(`Sites:    ${SITES.length}`);

  const userId = await getUserId();
  log('OK', `User ID: ${userId}`);

  const results: { name: string; passed: boolean }[] = [];

  for (const site of SITES) {
    try {
      const passed = await testSite(site, userId);
      results.push({ name: site.name, passed });
    } catch (err) {
      console.error(`\n  FATAL ERROR for ${site.name}:`, err);
      results.push({ name: site.name, passed: false });
    }
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('SUMMARY');
  console.log('='.repeat(60));
  for (const r of results) {
    console.log(`  ${r.passed ? 'PASS' : 'FAIL'}  ${r.name}`);
  }

  const allPassed = results.every((r) => r.passed);
  console.log(`\n${allPassed ? 'All tests passed!' : 'Some tests failed.'}`);
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
