import { AgentConfig, StreamEvent, SourceCitation } from '../types';

export interface ClientConfig {
  apiKey: string;
  baseUrl: string;
}

export class AgentForgeClient {
  private config: ClientConfig;
  private sessionToken: string | null = null;
  private sessionJti: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(config: ClientConfig) {
    this.config = config;
  }

  async initSession(existingJti?: string): Promise<{
    agentConfig: AgentConfig;
    sessionJti: string;
    expiresAt: string;
  }> {
    const res = await fetch(`${this.config.baseUrl}/api/widget/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: this.config.apiKey,
        session_jti: existingJti || undefined,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Session init failed' }));
      throw new Error(err.error || `Session init failed (${res.status})`);
    }

    const data = await res.json();
    this.sessionToken = data.session_token;
    this.sessionJti = data.session_jti;
    this.tokenExpiresAt = new Date(data.expires_at).getTime();

    // Map snake_case API response to camelCase AgentConfig
    const agent = data.agent;
    return {
      agentConfig: {
        id: agent.id,
        name: agent.name,
        welcomeMessage: agent.welcome_message ?? null,
        starterQuestions: agent.starter_questions ?? [],
        themeColor: agent.theme_color ?? '#171717',
      },
      sessionJti: data.session_jti,
      expiresAt: data.expires_at,
    };
  }

  async *sendMessage(message: string, conversationId?: string): AsyncGenerator<StreamEvent> {
    // Auto-refresh token if within 1 hour of expiry
    if (this.tokenExpiresAt - Date.now() < 3600_000 && this.sessionJti) {
      try {
        await this.initSession(this.sessionJti);
      } catch {
        // If refresh fails, try with current token
      }
    }

    if (!this.sessionToken) {
      throw new Error('No active session. Call initSession() first.');
    }

    const res = await fetch(`${this.config.baseUrl}/api/widget/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.sessionToken}`,
      },
      body: JSON.stringify({
        message,
        conversation_id: conversationId || undefined,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Chat request failed' }));
      throw new Error(err.error || `Chat failed (${res.status})`);
    }

    if (!res.body) {
      throw new Error('No response body');
    }

    // SSE stream parsing (ported from src/hooks/use-chat.ts pattern)
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const data = trimmed.slice(6);
          if (data === '[DONE]') {
            yield { type: 'done' };
            return;
          }

          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'text') {
              yield { type: 'text', content: parsed.content };
            } else if (parsed.type === 'sources') {
              yield {
                type: 'sources',
                sources: parsed.sources as SourceCitation[],
                conversationId: parsed.conversation_id,
                confidence: parsed.confidence,
                modelUsed: parsed.model_used,
                answeredFromSourcesOnly: parsed.answered_from_sources_only,
                messageId: parsed.message_id,
              };
            } else if (parsed.type === 'error') {
              yield { type: 'error', message: parsed.content };
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  getSessionJti(): string | null {
    return this.sessionJti;
  }

  isSessionValid(): boolean {
    return !!this.sessionToken && this.tokenExpiresAt > Date.now();
  }
}
