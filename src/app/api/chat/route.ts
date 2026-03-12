import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { generateQueryEmbedding } from '@/lib/gemini/embeddings';
import { generateStructuredResponse, streamChatResponse } from '@/lib/gemini/chat';
import { checkRateLimit, RATE_LIMITS, getClientIp, isLikelyBot } from '@/lib/rate-limiter';
import { recordUsageEvent } from '@/lib/usage-logger';
import {
  getPasscodeSessionCookieName,
  verifyPasscodeSessionToken,
} from '@/lib/security/passcode-session';
import { enhanceQuery } from '@/lib/rag/query-enhancer';
import { analyzeQuery } from '@/lib/rag/query-analyzer';
import { rerankChunks } from '@/lib/rag/reranker';
import { buildConversationContext } from '@/lib/rag/conversation-memory';
import { getCachedEmbedding, setCachedEmbedding } from '@/lib/rag/cache';
import type { MatchedChunk, SourceCitation } from '@/types';

async function getOrCreateQueryEmbedding(query: string) {
  let embedding = await getCachedEmbedding(query);
  if (!embedding) {
    embedding = await generateQueryEmbedding(query);
    await setCachedEmbedding(query, embedding);
  }
  return embedding;
}

function mergeMatchedChunks(chunkGroups: MatchedChunk[][]): MatchedChunk[] {
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

type PageLookup = {
  id: string;
  url: string;
  title: string | null;
};

async function loadPageMapForChunks(
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

function buildSourceFromChunk(
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

function buildContextSources(
  chunks: MatchedChunk[],
  pageMap: Map<string, PageLookup>,
  limit: number = 5
): SourceCitation[] {
  return chunks
    .map((chunk) => buildSourceFromChunk(chunk, pageMap))
    .filter((source): source is SourceCitation => Boolean(source))
    .slice(0, limit);
}

function buildValidatedStructuredSources(
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

async function retrieveRelevantChunks(
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

export async function POST(request: NextRequest) {
  // Bot detection (#18)
  if (isLikelyBot(request)) {
    return new Response(JSON.stringify({ error: 'Automated requests are not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Rate limiting (#17)
  const clientIp = getClientIp(request);
  const ipLimit = checkRateLimit(`chat:ip:${clientIp}`, RATE_LIMITS.chat);
  if (!ipLimit.allowed) {
    return new Response(
      JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(Math.ceil((ipLimit.retryAfterMs || 60000) / 1000)),
        },
      }
    );
  }

  const contentType = request.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    return new Response(JSON.stringify({ error: 'Content-Type must be application/json' }), {
      status: 415,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: { agent_id?: string; message?: string; conversation_id?: string; session_id?: string; share_token?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const { agent_id, message, conversation_id, session_id, share_token } = body;

  if (!agent_id || !message || !session_id) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Per-session rate limit
  const sessionLimit = checkRateLimit(`chat:session:${agent_id}:${session_id}`, RATE_LIMITS.chatSession);
  if (!sessionLimit.allowed) {
    return new Response(
      JSON.stringify({ error: 'Too many messages. Please slow down.' }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(Math.ceil((sessionLimit.retryAfterMs || 30000) / 1000)),
        },
      }
    );
  }

  const supabase = createServiceClient();

  // Get agent
  const { data: agent } = await supabase
    .from('agents')
    .select('*')
    .eq('id', agent_id)
    .single();

  if (!agent) {
    return new Response(JSON.stringify({ error: 'Agent not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (agent.status !== 'ready') {
    return new Response(JSON.stringify({ error: 'Agent is not ready yet' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let validShareLink: {
    id: string;
    agent_id: string;
    expires_at: string | null;
    max_uses: number | null;
    use_count: number;
  } | null = null;

  // Share link validation (#14, #15, #16)
  if (share_token) {
    const { data: shareLink } = await supabase
      .from('share_links')
      .select('id, agent_id, expires_at, max_uses, use_count, revoked_at')
      .eq('token', share_token)
      .is('revoked_at', null)
      .single();

    if (!shareLink) {
      return new Response(JSON.stringify({ error: 'Invalid share link' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (shareLink.agent_id !== agent_id) {
      return new Response(JSON.stringify({ error: 'Invalid share link' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check expiration
    if (shareLink.expires_at && new Date(shareLink.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'Share link has expired' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check max uses
    if (shareLink.max_uses && shareLink.use_count >= shareLink.max_uses) {
      return new Response(JSON.stringify({ error: 'Share link usage limit reached' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    validShareLink = shareLink;
  }

  const passcodeSession = request.cookies.get(getPasscodeSessionCookieName(agent_id))?.value;
  const hasValidPasscodeSession = passcodeSession
    ? verifyPasscodeSessionToken(passcodeSession, agent_id)
    : false;

  if (agent.visibility === 'private' && !validShareLink) {
    return new Response(JSON.stringify({ error: 'This agent requires a valid share link' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (agent.visibility === 'passcode' && !validShareLink && !hasValidPasscodeSession) {
    return new Response(JSON.stringify({ error: 'Passcode verification required' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Get agent settings
  const { data: agentSettings } = await supabase
    .from('agent_settings')
    .select('*')
    .eq('agent_id', agent_id)
    .single();

  // Get or create conversation (before stream so we have convId)
  let convId = conversation_id;
  if (!convId) {
    const insertData: Record<string, unknown> = {
      agent_id,
      session_id,
      title: message.slice(0, 100),
    };
    if (validShareLink) {
      insertData.share_link_id = validShareLink.id;

      // Increment use count atomically (#16) once per conversation creation.
      await supabase.rpc('increment_counter', {
        table_name: 'share_links',
        row_id: validShareLink.id,
        column_name: 'use_count',
      }).then(null, () => {
        return supabase
          .from('share_links')
          .update({ use_count: (validShareLink!.use_count || 0) + 1 })
          .eq('id', validShareLink!.id);
      });
    }
    const { data: conv } = await supabase
      .from('conversations')
      .insert(insertData)
      .select('id')
      .single();
    convId = conv?.id;
  }

  // Get conversation history
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

        const { chunks: context, enhancedQuery, analysis } = await retrieveRelevantChunks(
          supabase,
          agent_id,
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
              message_id: assistantMessageId,
            })}\n\n`
          )
        );

        // Record usage event (#23)
        recordUsageEvent({
          agent_id,
          event_type: 'chat',
          metadata: {
            model_used: defaultModel,
            sources_count: sources.length,
            query_enhanced: enhancedQuery.reformulated !== enhancedQuery.original,
            is_follow_up: enhancedQuery.isFollowUp,
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
            agent_id,
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
            agent_id,
            event_type: 'chat',
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
          const errorMsg = streamError instanceof Error ? streamError.message : 'An error occurred while generating the response.';
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'error', content: errorMsg })}\n\n`)
          );
          controller.close();
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
