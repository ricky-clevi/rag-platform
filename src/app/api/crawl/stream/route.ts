import { NextRequest } from 'next/server';
import Redis from 'ioredis';
import { getRedisConnectionOpts } from '@/lib/queue/connection';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const agentId = request.nextUrl.searchParams.get('agent_id');
  if (!agentId) {
    return new Response('Missing agent_id', { status: 400 });
  }

  const encoder = new TextEncoder();
  let subscriber: Redis | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        subscriber = new Redis(getRedisConnectionOpts());

        subscriber.subscribe(`crawl:${agentId}`, (err) => {
          if (err) {
            console.error('Redis subscribe error:', err);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: 'Failed to connect to progress stream' })}\n\n`));
            controller.close();
          }
        });

        subscriber.on('message', (_channel: string, message: string) => {
          try {
            controller.enqueue(encoder.encode(`data: ${message}\n\n`));

            const parsed = JSON.parse(message);
            if (parsed.type === 'completed' || parsed.type === 'failed') {
              // Give client time to process final event
              setTimeout(() => {
                try { controller.close(); } catch { /* already closed */ }
                subscriber?.quit();
              }, 1000);
            }
          } catch {
            // Skip invalid messages
          }
        });

        // Send initial heartbeat
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected', agent_id: agentId })}\n\n`));

        // Heartbeat every 15 seconds to keep connection alive
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'heartbeat' })}\n\n`));
          } catch {
            clearInterval(heartbeat);
          }
        }, 15000);

        // Clean up on client disconnect
        request.signal.addEventListener('abort', () => {
          clearInterval(heartbeat);
          subscriber?.quit();
          try { controller.close(); } catch { /* already closed */ }
        });
      } catch (error) {
        console.error('SSE stream setup error:', error);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: 'Stream setup failed' })}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
