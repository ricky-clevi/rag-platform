import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { generateQueryEmbedding } from '@/lib/gemini/embeddings';
import { streamChatResponse } from '@/lib/gemini/chat';
import type { MatchedDocument } from '@/types';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { agent_id, message, conversation_id, session_id } = body;

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

  try {
    // Generate embedding for the query
    const queryEmbedding = await generateQueryEmbedding(message);

    // Similarity search
    const { data: matchedDocs } = await supabase.rpc('match_documents', {
      query_embedding: JSON.stringify(queryEmbedding),
      match_agent_id: agent_id,
      match_threshold: 0.5,
      match_count: 5,
    });

    const context: MatchedDocument[] = matchedDocs || [];

    // Get or create conversation
    let convId = conversation_id;
    if (!convId) {
      const { data: conv } = await supabase
        .from('conversations')
        .insert({
          agent_id,
          session_id,
          title: message.slice(0, 100),
        })
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
      });
    }

    // Stream response
    const encoder = new TextEncoder();
    let fullResponse = '';

    const sources = context
      .filter((doc) => doc.metadata?.source_url)
      .map((doc) => ({
        url: doc.metadata.source_url!,
        title: doc.metadata.page_title || doc.metadata.source_url!,
        snippet: doc.content.slice(0, 150) + '...',
      }));

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const generator = streamChatResponse(
            agent.name,
            agent.website_url,
            message,
            context,
            history
          );

          for await (const chunk of generator) {
            fullResponse += chunk;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'text', content: chunk })}\n\n`)
            );
          }

          // Send sources
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'sources', sources, conversation_id: convId })}\n\n`
            )
          );

          // Save assistant message
          if (convId) {
            await supabase.from('messages').insert({
              conversation_id: convId,
              role: 'assistant',
              content: fullResponse,
              sources,
            });
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Stream error';
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'error', content: errorMsg })}\n\n`)
          );
          controller.close();
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
