import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { generateQueryEmbedding } from '@/lib/gemini/embeddings';
import { generateStructuredResponse, streamChatResponse } from '@/lib/gemini/chat';
import type { MatchedChunk, SourceCitation } from '@/types';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { agent_id, message, conversation_id, session_id, share_token } = body;

  if (!agent_id || !message || !session_id) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
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

  // Get agent settings
  const { data: agentSettings } = await supabase
    .from('agent_settings')
    .select('*')
    .eq('agent_id', agent_id)
    .single();

  try {
    // Generate embedding for the query
    const queryEmbedding = await generateQueryEmbedding(message);

    // Hybrid search: vector + full-text
    const { data: matchedChunks } = await supabase.rpc('hybrid_search', {
      p_agent_id: agent_id,
      p_query_embedding: JSON.stringify(queryEmbedding),
      p_query_text: message,
      p_match_count: 8,
      p_vector_weight: 0.7,
      p_keyword_weight: 0.3,
    });

    const context: MatchedChunk[] = matchedChunks || [];

    // Get or create conversation
    let convId = conversation_id;
    if (!convId) {
      const insertData: Record<string, unknown> = {
        agent_id,
        session_id,
        title: message.slice(0, 100),
      };
      if (share_token) {
        const { data: shareLink } = await supabase
          .from('share_links')
          .select('id')
          .eq('token', share_token)
          .is('revoked_at', null)
          .single();
        if (shareLink) {
          insertData.share_link_id = shareLink.id;
        }
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
      const { data: messages } = await supabase
        .from('messages')
        .select('role, content')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true })
        .limit(10);
      history = (messages || []) as { role: 'user' | 'assistant'; content: string }[];
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

    // Get page URLs for chunks to build sources
    const pageIds = [...new Set(context.filter((c) => c.page_id).map((c) => c.page_id!))];
    const { data: pages } = pageIds.length > 0
      ? await supabase.from('pages').select('id, url, title').in('id', pageIds)
      : { data: [] };
    const pageMap = new Map((pages || []).map((p) => [p.id, p]));

    // Stream response
    const encoder = new TextEncoder();
    let fullResponse = '';

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const { structured, model_used } = await generateStructuredResponse(
            agent.name,
            agent.root_url,
            message,
            context,
            history,
            {
              systemPrompt: agentSettings?.system_prompt,
              temperature: agentSettings?.temperature,
              maxTokens: agentSettings?.max_tokens,
              defaultModel: agentSettings?.default_model,
              escalationModel: agentSettings?.escalation_model,
              escalationThreshold: agentSettings?.escalation_threshold,
            }
          );

          fullResponse = structured.answer;

          // Send the answer as text chunks
          const chunkSize = 20;
          for (let i = 0; i < structured.answer.length; i += chunkSize) {
            const textChunk = structured.answer.slice(i, i + chunkSize);
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'text', content: textChunk })}\n\n`)
            );
          }

          // Build sources from structured citations
          const sources: SourceCitation[] = structured.citations.map((c) => ({
            url: c.url || '',
            title: c.title || '',
            snippet: c.excerpt || '',
          }));

          // Fall back to chunk-based sources if no citations
          if (sources.length === 0) {
            for (const chunk of context.slice(0, 5)) {
              const page = chunk.page_id ? pageMap.get(chunk.page_id) : null;
              if (page) {
                sources.push({
                  url: page.url,
                  title: page.title || page.url,
                  snippet: chunk.snippet || chunk.content.slice(0, 150) + '...',
                  heading_path: chunk.heading_path || undefined,
                  similarity: chunk.similarity,
                });
              }
            }
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
              })}\n\n`
            )
          );

          if (convId) {
            await supabase.from('messages').insert({
              conversation_id: convId,
              role: 'assistant',
              content: fullResponse,
              sources,
              model_used,
              confidence: structured.confidence,
              token_usage: {},
            });
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch {
          // Fall back to streaming
          try {
            const generator = streamChatResponse(
              agent.name,
              agent.root_url,
              message,
              context,
              history,
              {
                systemPrompt: agentSettings?.system_prompt,
                temperature: agentSettings?.temperature,
                maxTokens: agentSettings?.max_tokens,
              }
            );

            for await (const chunk of generator) {
              fullResponse += chunk;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: 'text', content: chunk })}\n\n`)
              );
            }

            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'sources', sources: [], conversation_id: convId })}\n\n`)
            );

            if (convId) {
              await supabase.from('messages').insert({
                conversation_id: convId,
                role: 'assistant',
                content: fullResponse,
                sources: [],
                token_usage: {},
              });
            }

            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          } catch (streamError) {
            const errorMsg = streamError instanceof Error ? streamError.message : 'Stream error';
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
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
