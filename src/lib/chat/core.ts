import { createServiceClient } from '@/lib/supabase/server';
import { generateQueryEmbedding } from '@/lib/gemini/embeddings';
import { generateStructuredResponse, streamChatResponse } from '@/lib/gemini/chat';
import { recordUsageEvent } from '@/lib/usage-logger';
import type { UsageEventType } from '@/lib/usage-logger';
import { enhanceQuery } from '@/lib/rag/query-enhancer';
import { analyzeQuery } from '@/lib/rag/query-analyzer';
import { rerankChunks } from '@/lib/rag/reranker';
import { buildConversationContext } from '@/lib/rag/conversation-memory';
import { getCachedEmbedding, setCachedEmbedding } from '@/lib/rag/cache';
import type { MatchedChunk, SourceCitation } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PageLookup = {
  id: string;
  url: string;
  title: string | null;
};

export interface ChatServiceRequest {
  supabase: ReturnType<typeof createServiceClient>;
  agentId: string;
  agent: { name: string; root_url: string };
  agentSettings: {
    system_prompt?: string | null;
    welcome_message?: string | null;
    starter_questions?: string[];
    temperature?: number;
    max_tokens?: number;
    default_model?: string;
    escalation_model?: string;
    escalation_threshold?: number;
    theme_color?: string;
  } | null;
  message: string;
  sessionId: string;
  conversationId?: string;
  shareLinkId?: string;
  eventType: UsageEventType;
  clientIp: string;
}

export interface ChatServiceResult {
  stream: ReadableStream;
  conversationId: string;
}

// ---------------------------------------------------------------------------
// Helper functions (extracted from route)
// ---------------------------------------------------------------------------

export async function getOrCreateQueryEmbedding(query: string) {
  let embedding = await getCachedEmbedding(query);
  if (!embedding) {
    embedding = await generateQueryEmbedding(query);
    await setCachedEmbedding(query, embedding);
  }
  return embedding;
}

export function mergeMatchedChunks(chunkGroups: MatchedChunk[][]): MatchedChunk[] {
  const chunkMap = new Map<string, MatchedChunk>();

  for (const group of chunkGroups) {
    for (const chunk of group) {
      const existing = chunkMap.get(chunk.id);
      if (!existing || (chunk.combined_score || 0) > (existing.combined_score || 0)) {
        chunkMap.set(chunk.id, chunk);
      }
    }
  }

  return [...chunkMap.values()].sort((a, b) => b.combined_score - a.combined_score);
}

export async function loadPageMapForChunks(
  supabase: ReturnType<typeof createServiceClient>,
  chunks: MatchedChunk[]
): Promise<Map<string, PageLookup>> {
  const pageIds = [
    ...new Set(
      chunks.map((chunk) => chunk.page_id).filter((value): value is string => Boolean(value))
    ),
  ];

  if (pageIds.length === 0) {
    return new Map();
  }

  const { data: pages } = await supabase
    .from('pages')
    .select('id, url, title')
    .in('id', pageIds);

  return new Map(((pages || []) as PageLookup[]).map((page) => [page.id, page]));
}

export function buildSourceFromChunk(
  chunk: MatchedChunk,
  pageMap: Map<string, PageLookup>
): SourceCitation | null {
  if (!chunk.page_id) {
    return null;
  }

  const page = pageMap.get(chunk.page_id);
  if (!page?.url) {
    return null;
  }

  return {
    chunk_id: chunk.id,
    url: page.url,
    title: page.title || page.url,
    snippet: chunk.snippet || chunk.content.slice(0, 150),
    heading_path: chunk.heading_path || undefined,
    similarity: chunk.similarity,
  };
}

export function buildContextSources(
  chunks: MatchedChunk[],
  pageMap: Map<string, PageLookup>,
  limit: number = 5
): SourceCitation[] {
  return chunks
    .map((chunk) => buildSourceFromChunk(chunk, pageMap))
    .filter((source): source is SourceCitation => Boolean(source))
    .slice(0, limit);
}

export function buildValidatedStructuredSources(
  citations: Array<{ chunk_id?: string; excerpt?: string }>,
  chunks: MatchedChunk[],
  pageMap: Map<string, PageLookup>
): SourceCitation[] {
  const chunkMap = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  const seenChunkIds = new Set<string>();
  const sources: SourceCitation[] = [];

  for (const citation of citations) {
    if (!citation?.chunk_id || seenChunkIds.has(citation.chunk_id)) {
      continue;
    }

    const chunk = chunkMap.get(citation.chunk_id);
    if (!chunk) {
      continue;
    }

    const source = buildSourceFromChunk(chunk, pageMap);
    if (!source) {
      continue;
    }

    sources.push({
      ...source,
      snippet:
        typeof citation.excerpt === 'string' && citation.excerpt.trim().length > 0
          ? citation.excerpt.trim()
          : source.snippet,
    });
    seenChunkIds.add(citation.chunk_id);
  }

  return sources;
}

export async function retrieveRelevantChunks(
  supabase: ReturnType<typeof createServiceClient>,
  agentId: string,
  message: string,
  contextForSearch: string,
  agentName: string
): Promise<{
  chunks: MatchedChunk[];
  enhancedQuery: Awaited<ReturnType<typeof enhanceQuery>>;
  analysis: Awaited<ReturnType<typeof analyzeQuery>>;
}> {
  const analysis = await analyzeQuery(message, contextForSearch);
  const enhancedQuery = await enhanceQuery(analysis.resolvedQuery, contextForSearch, agentName);
  const primaryQueries =
    analysis.complexity === 'simple'
      ? [enhancedQuery.reformulated]
      : analysis.subQueries.slice(0, 4);

  const searchGroups = await Promise.all(
    primaryQueries.map(async (query) => {
      const queryEmbedding = await getOrCreateQueryEmbedding(query);
      const { data } = await supabase.rpc('hybrid_search', {
        query_embedding: JSON.stringify(queryEmbedding),
        query_text: query,
        match_agent_id: agentId,
        match_count: analysis.complexity === 'simple' ? 15 : 8,
        semantic_weight: 0.7,
        keyword_weight: 0.3,
      });
      return (data || []) as MatchedChunk[];
    })
  );

  let merged = mergeMatchedChunks(searchGroups);

  if (analysis.shouldReflect && merged.length < 8) {
    const reflectionQuery = [enhancedQuery.reformulated, ...analysis.subQueries]
      .filter(Boolean)
      .join(' ');
    const reflectionEmbedding = await getOrCreateQueryEmbedding(reflectionQuery);
    const { data } = await supabase.rpc('hybrid_search', {
      query_embedding: JSON.stringify(reflectionEmbedding),
      query_text: reflectionQuery,
      match_agent_id: agentId,
      match_count: 12,
      semantic_weight: 0.72,
      keyword_weight: 0.28,
    });
    merged = mergeMatchedChunks([merged, (data || []) as MatchedChunk[]]);
  }

  const reranked = await rerankChunks(message, merged, 6);
  return { chunks: reranked, enhancedQuery, analysis };
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

export async function runChatRequest(req: ChatServiceRequest): Promise<ChatServiceResult> {
  const {
    supabase,
    agentId,
    agent,
    agentSettings,
    message,
    sessionId,
    shareLinkId,
    eventType,
    clientIp,
  } = req;

  // Get or create conversation
  let convId = req.conversationId;

  if (convId) {
    // Validate conversation ownership
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id, agent_id, session_id')
      .eq('id', convId)
      .single();

    if (!existingConv || existingConv.agent_id !== agentId || existingConv.session_id !== sessionId) {
      // Mismatch — ignore provided conversationId, create a new one
      convId = undefined;
    }
  }

  if (!convId) {
    const insertData: Record<string, unknown> = {
      agent_id: agentId,
      session_id: sessionId,
      title: message.slice(0, 100),
    };
    if (shareLinkId) {
      insertData.share_link_id = shareLinkId;
    }
    const { data: conv } = await supabase
      .from('conversations')
      .insert(insertData)
      .select('id')
      .single();
    convId = conv?.id;
  }

  // Load conversation history (up to 20 messages)
  let history: { role: 'user' | 'assistant'; content: string }[] = [];
  if (convId) {
    const { data: existingMessages } = await supabase
      .from('messages')
      .select('role, content')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })
      .limit(20);
    history = (existingMessages || []) as { role: 'user' | 'assistant'; content: string }[];
  }

  // Save user message
  if (convId) {
    await supabase.from('messages').insert({
      conversation_id: convId,
      role: 'user',
      content: message,
      sources: [],
      token_usage: {},
    });
  }

  const defaultModel = agentSettings?.default_model || 'gemini-3.1-flash-lite-preview';

  // Stream response — all heavy lifting happens inside the stream
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Build conversation context with memory management
        const { recentMessages, summary, contextForSearch } = await buildConversationContext(history);

        const { chunks: context, enhancedQuery: eqResult, analysis } = await retrieveRelevantChunks(
          supabase,
          agentId,
          message,
          contextForSearch,
          agent.name
        );
        const pageMap = await loadPageMapForChunks(supabase, context);

        // Build history with summary for the chat model
        const historyForChat: { role: 'user' | 'assistant'; content: string }[] = summary
          ? [{ role: 'user' as const, content: `[Previous conversation summary: ${summary}]` }, ...recentMessages]
          : recentMessages;

        // REAL streaming — tokens arrive one by one
        let fullResponse = '';
        const generator = streamChatResponse(
          agent.name,
          agent.root_url,
          message,
          context,
          historyForChat,
          {
            systemPrompt: agentSettings?.system_prompt,
            temperature: agentSettings?.temperature,
            maxTokens: agentSettings?.max_tokens,
            model: defaultModel,
          }
        );

        for await (const chunk of generator) {
          fullResponse += chunk;
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'text', content: chunk })}\n\n`)
          );
        }

        const sources = buildContextSources(context, pageMap);

        let assistantMessageId: string | null = null;
        if (convId) {
          const { data: insertedMessage } = await supabase
            .from('messages')
            .insert({
              conversation_id: convId,
              role: 'assistant',
              content: fullResponse,
              sources,
              model_used: defaultModel,
              token_usage: {},
            })
            .select('id')
            .single();
          assistantMessageId = insertedMessage?.id || null;
        }

        // Send sources after stream completes
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'sources',
              sources,
              conversation_id: convId,
              confidence: null,
              model_used: defaultModel,
              answered_from_sources_only: false,
              message_id: assistantMessageId,
            })}\n\n`
          )
        );

        // Record usage event
        recordUsageEvent({
          agent_id: agentId,
          event_type: eventType,
          metadata: {
            model_used: defaultModel,
            sources_count: sources.length,
            query_enhanced: eqResult.reformulated !== eqResult.original,
            is_follow_up: eqResult.isFollowUp,
            query_complexity: analysis.complexity,
            conversation_id: convId,
            ip: clientIp,
          },
        });

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (streamError) {
        // Fallback: try structured response if streaming fails
        try {
          const { recentMessages, contextForSearch } = await buildConversationContext(history);
          const { chunks: context, analysis } = await retrieveRelevantChunks(
            supabase,
            agentId,
            message,
            contextForSearch,
            agent.name
          );
          const pageMap = await loadPageMapForChunks(supabase, context);

          const { structured, model_used } = await generateStructuredResponse(
            agent.name,
            agent.root_url,
            message,
            context,
            recentMessages,
            {
              systemPrompt: agentSettings?.system_prompt,
              temperature: agentSettings?.temperature,
              maxTokens: agentSettings?.max_tokens,
              defaultModel: agentSettings?.default_model,
              escalationModel: agentSettings?.escalation_model,
              escalationThreshold: agentSettings?.escalation_threshold,
            }
          );

          // Send full answer in one chunk
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'text', content: structured.answer })}\n\n`)
          );

          // Only keep citations that refer to retrieved chunks and stored pages.
          let sources = buildValidatedStructuredSources(structured.citations, context, pageMap);

          // Fall back to chunk-based sources if no citations
          if (sources.length === 0) {
            sources = buildContextSources(context, pageMap);
          }

          let assistantMessageId: string | null = null;
          if (convId) {
            const { data: insertedMessage } = await supabase
              .from('messages')
              .insert({
                conversation_id: convId,
                role: 'assistant',
                content: structured.answer,
                sources,
                model_used,
                confidence: structured.confidence,
                token_usage: {},
              })
              .select('id')
              .single();
            assistantMessageId = insertedMessage?.id || null;
          }

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'sources',
                sources,
                conversation_id: convId,
                confidence: structured.confidence,
                model_used,
                answered_from_sources_only: structured.answered_from_sources_only,
                message_id: assistantMessageId,
              })}\n\n`
            )
          );

          recordUsageEvent({
            agent_id: agentId,
            event_type: eventType,
            metadata: {
              model_used,
              confidence: structured.confidence,
              fallback: true,
              query_complexity: analysis.complexity,
              conversation_id: convId,
              ip: clientIp,
            },
          });

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (fallbackError) {
          console.error('Chat fallback error:', fallbackError);
          // Send a generic error message to avoid leaking internal details to public callers
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'error', content: 'An error occurred while generating the response.' })}\n\n`)
          );
          controller.close();
        }
      }
    },
  });

  return { stream, conversationId: convId! };
}
