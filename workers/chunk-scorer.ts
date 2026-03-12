import './load-env';
import { createClient } from '@supabase/supabase-js';

type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

interface ChunkRow {
  id: string;
  agent_id: string;
  page_id: string | null;
  content: string;
  heading_path: string | null;
  token_count: number | null;
  quality_score?: number | null;
}

interface PageRow {
  id: string;
  last_crawled_at: string | null;
  change_summary: {
    changed_at?: string;
    diff_size?: number;
    summary?: string;
  } | null;
}

interface MessageRow {
  feedback: 'positive' | 'negative' | null;
  sources: Array<{ chunk_id?: string }> | null;
}

interface UsageEventRow {
  agent_id: string;
}

interface CliOptions {
  agentId?: string;
  chunkBatchSize: number;
  usageWindowDays: number;
  maxMessageBatches: number;
}

interface ChunkUsageStats {
  citations: number;
  positiveFeedback: number;
  negativeFeedback: number;
}

interface AggregateStats {
  chunkUsage: Map<string, ChunkUsageStats>;
  agentChatEvents: Map<string, number>;
}

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value));
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function scoreInformationDensity(chunk: ChunkRow): number {
  const content = normalizeWhitespace(chunk.content || '');
  if (!content) return 0.2;

  const words = content.split(' ').filter(Boolean);
  const uniqueWords = new Set(words.map((word) => word.toLowerCase()));
  const headingBoost = chunk.heading_path ? 0.08 : 0;
  const tokenCount = chunk.token_count ?? words.length;
  const tokensNormalized = clamp(tokenCount / 220, 0, 1);
  const lexicalDiversity = clamp(uniqueWords.size / Math.max(words.length, 1), 0, 1);
  const sentenceCount = Math.max(1, content.split(/[.!?]\s+/).filter(Boolean).length);
  const avgSentenceLength = clamp(words.length / sentenceCount / 28, 0, 1);
  const numericSignal = clamp((content.match(/\d/g) || []).length / 20, 0, 1);
  const lineBreakSignal = clamp((chunk.content.match(/\n/g) || []).length / 8, 0, 1);

  const density =
    0.35 * tokensNormalized
    + 0.25 * lexicalDiversity
    + 0.15 * avgSentenceLength
    + 0.15 * numericSignal
    + 0.1 * lineBreakSignal
    + headingBoost;

  return clamp(density, 0.1, 1);
}

function scoreFreshness(page: PageRow | undefined): number {
  if (!page?.last_crawled_at) return 0.75;

  const crawledAt = new Date(page.last_crawled_at).getTime();
  if (Number.isNaN(crawledAt)) return 0.75;

  const daysSinceCrawl = (Date.now() - crawledAt) / (1000 * 60 * 60 * 24);
  const crawlDecay = Math.exp(-daysSinceCrawl / 45);

  const changedAt = page.change_summary?.changed_at
    ? new Date(page.change_summary.changed_at).getTime()
    : null;
  const daysSinceChange =
    changedAt && !Number.isNaN(changedAt)
      ? (Date.now() - changedAt) / (1000 * 60 * 60 * 24)
      : null;
  const changeRecency = daysSinceChange == null ? 0.5 : Math.exp(-daysSinceChange / 21);
  const diffPenalty = clamp((page.change_summary?.diff_size ?? 0) / 5000, 0, 0.35);

  return clamp(0.65 * crawlDecay + 0.25 * changeRecency + 0.1 * (1 - diffPenalty), 0.2, 1);
}

function scoreUsage(agentId: string, stats: ChunkUsageStats | undefined, aggregate: AggregateStats): number {
  const citations = stats?.citations ?? 0;
  const chatEvents = aggregate.agentChatEvents.get(agentId) ?? 0;
  const baseRate = citations / Math.max(chatEvents, 1);
  const citationScore = clamp(sigmoid(baseRate * 6 - 2), 0, 1);
  const coverageBonus = citations > 0 ? clamp(Math.log10(citations + 1) / 2, 0, 0.2) : 0;

  return clamp(citationScore + coverageBonus, 0.15, 1);
}

function scoreFeedback(stats: ChunkUsageStats | undefined): number {
  const positive = stats?.positiveFeedback ?? 0;
  const negative = stats?.negativeFeedback ?? 0;
  const total = positive + negative;

  if (total === 0) return 0.55;

  const ratio = (positive - negative) / total;
  return clamp(0.55 + ratio * 0.35, 0.1, 1);
}

function combineScores(parts: {
  informationDensity: number;
  freshness: number;
  usage: number;
  feedback: number;
}): number {
  const weighted =
    0.4 * parts.informationDensity
    + 0.2 * parts.freshness
    + 0.25 * parts.usage
    + 0.15 * parts.feedback;

  return Number(clamp(weighted, 0.1, 2).toFixed(4));
}

function parseCliArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    chunkBatchSize: 200,
    usageWindowDays: 90,
    maxMessageBatches: 100,
  };

  for (const arg of argv) {
    if (arg.startsWith('--agent=')) {
      options.agentId = arg.slice('--agent='.length);
    } else if (arg.startsWith('--agentId=')) {
      options.agentId = arg.slice('--agentId='.length);
    } else if (arg.startsWith('--chunk-batch=')) {
      options.chunkBatchSize = Math.max(25, Number.parseInt(arg.slice('--chunk-batch='.length), 10) || 200);
    } else if (arg.startsWith('--usage-window-days=')) {
      options.usageWindowDays = Math.max(7, Number.parseInt(arg.slice('--usage-window-days='.length), 10) || 90);
    } else if (arg.startsWith('--max-message-batches=')) {
      options.maxMessageBatches = Math.max(1, Number.parseInt(arg.slice('--max-message-batches='.length), 10) || 100);
    }
  }

  return options;
}

async function fetchUsageAggregates(
  supabase: ReturnType<typeof getSupabaseClient>,
  options: CliOptions
): Promise<AggregateStats> {
  const chunkUsage = new Map<string, ChunkUsageStats>();
  const agentChatEvents = new Map<string, number>();
  const since = new Date(Date.now() - options.usageWindowDays * 24 * 60 * 60 * 1000).toISOString();

  let usageOffset = 0;
  while (true) {
    let usageQuery = supabase
      .from('usage_events')
      .select('agent_id')
      .eq('event_type', 'chat')
      .gte('created_at', since)
      .range(usageOffset, usageOffset + 999);

    if (options.agentId) {
      usageQuery = usageQuery.eq('agent_id', options.agentId);
    }

    const { data, error } = await usageQuery;
    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const row of data as UsageEventRow[]) {
      agentChatEvents.set(row.agent_id, (agentChatEvents.get(row.agent_id) ?? 0) + 1);
    }

    if (data.length < 1000) break;
    usageOffset += 1000;
  }

  for (let batch = 0; batch < options.maxMessageBatches; batch++) {
    const from = batch * 500;
    const to = from + 499;
    let messageQuery = supabase
      .from('messages')
      .select('feedback, sources, conversations!inner(agent_id)')
      .eq('role', 'assistant')
      .gte('created_at', since)
      .range(from, to);

    if (options.agentId) {
      messageQuery = messageQuery.eq('conversations.agent_id', options.agentId);
    }

    const { data, error } = await messageQuery;
    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const row of data as unknown as Array<MessageRow & { conversations?: { agent_id: string }[] }>) {
      const uniqueChunkIds = new Set(
        Array.isArray(row.sources)
          ? row.sources
              .map((source) => source?.chunk_id)
              .filter((chunkId): chunkId is string => typeof chunkId === 'string' && chunkId.length > 0)
          : []
      );

      for (const chunkId of uniqueChunkIds) {
        const current = chunkUsage.get(chunkId) ?? {
          citations: 0,
          positiveFeedback: 0,
          negativeFeedback: 0,
        };

        current.citations += 1;

        if (row.feedback === 'positive') {
          current.positiveFeedback += 1;
        } else if (row.feedback === 'negative') {
          current.negativeFeedback += 1;
        }

        chunkUsage.set(chunkId, current);
      }
    }

    if (data.length < 500) break;
  }

  return { chunkUsage, agentChatEvents };
}

async function fetchPageMap(
  supabase: ReturnType<typeof getSupabaseClient>,
  chunkBatch: ChunkRow[]
): Promise<Map<string, PageRow>> {
  const pageIds = [...new Set(chunkBatch.map((chunk) => chunk.page_id).filter((value): value is string => Boolean(value)))];
  if (pageIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('pages')
    .select('id, last_crawled_at, change_summary')
    .in('id', pageIds);

  if (error) throw error;

  return new Map(
    ((data || []) as PageRow[]).map((page) => [page.id, page])
  );
}

async function scoreBatch(
  supabase: ReturnType<typeof getSupabaseClient>,
  aggregate: AggregateStats,
  chunks: ChunkRow[]
): Promise<number> {
  const pageMap = await fetchPageMap(supabase, chunks);
  let updated = 0;

  for (const chunk of chunks) {
    const usageStats = aggregate.chunkUsage.get(chunk.id);
    const score = combineScores({
      informationDensity: scoreInformationDensity(chunk),
      freshness: scoreFreshness(chunk.page_id ? pageMap.get(chunk.page_id) : undefined),
      usage: scoreUsage(chunk.agent_id, usageStats, aggregate),
      feedback: scoreFeedback(usageStats),
    });

    const { error } = await supabase
      .from('chunks')
      .update({ quality_score: score })
      .eq('id', chunk.id);

    if (error) throw error;
    updated += 1;
  }

  return updated;
}

async function runChunkScorer(options: CliOptions) {
  const supabase = getSupabaseClient();
  const aggregate = await fetchUsageAggregates(supabase, options);

  let offset = 0;
  let totalUpdated = 0;

  while (true) {
    let chunkQuery = supabase
      .from('chunks')
      .select('id, agent_id, page_id, content, heading_path, token_count, quality_score')
      .order('created_at', { ascending: true })
      .range(offset, offset + options.chunkBatchSize - 1);

    if (options.agentId) {
      chunkQuery = chunkQuery.eq('agent_id', options.agentId);
    }

    const { data, error } = await chunkQuery;
    if (error) throw error;

    const chunkBatch = (data || []) as ChunkRow[];
    if (chunkBatch.length === 0) break;

    totalUpdated += await scoreBatch(supabase, aggregate, chunkBatch);
    offset += chunkBatch.length;

    console.log(
      `[chunk-scorer] processed ${totalUpdated} chunks`
      + (options.agentId ? ` for agent ${options.agentId}` : '')
    );

    if (chunkBatch.length < options.chunkBatchSize) break;
  }

  console.log(`[chunk-scorer] completed, updated ${totalUpdated} chunks`);
}

if (require.main === module) {
  runChunkScorer(parseCliArgs(process.argv.slice(2))).catch((error) => {
    const message = error instanceof Error ? error.message : String(error as Json);
    console.error(`[chunk-scorer] failed: ${message}`);
    process.exit(1);
  });
}

export { runChunkScorer, parseCliArgs };
