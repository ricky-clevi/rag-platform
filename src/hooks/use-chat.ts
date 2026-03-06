'use client';

import { useState, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { SourceCitation } from '@/types';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: SourceCitation[];
  isStreaming?: boolean;
  confidence?: number;
  model_used?: string;
  answered_from_sources_only?: boolean;
}

interface UseChatMessages {
  requestFailed: string;
  retryAfter: string;
  noResponseBody: string;
  streamError: string;
  genericError: string;
}

const defaultMessages: UseChatMessages = {
  requestFailed: 'Chat request failed',
  retryAfter: 'Please try again in {seconds} seconds.',
  noResponseBody: 'No response body',
  streamError: 'An error occurred',
  genericError: 'Sorry, an error occurred. Please try again.',
};

function interpolateRetryAfter(template: string, seconds: string) {
  return template.replace('{seconds}', seconds);
}

export function useChat(
  agentId: string,
  shareToken?: string,
  uiMessages: UseChatMessages = defaultMessages
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const sessionIdRef = useRef(uuidv4());
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim()) return;

      const userMessage: ChatMessage = {
        id: uuidv4(),
        role: 'user',
        content: content.trim(),
      };

      const assistantMessage: ChatMessage = {
        id: uuidv4(),
        role: 'assistant',
        content: '',
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setIsLoading(true);

      abortControllerRef.current = new AbortController();

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agent_id: agentId,
            message: content.trim(),
            conversation_id: conversationId,
            session_id: sessionIdRef.current,
            share_token: shareToken,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          let errorMessage = uiMessages.requestFailed;
          try {
            const errorBody = await response.json();
            errorMessage = errorBody.error || errorMessage;
          } catch {
            // Could not parse error body
          }
          if (response.status === 429) {
            const retryAfter = response.headers.get('Retry-After');
            errorMessage = retryAfter
              ? `${errorMessage} ${interpolateRetryAfter(uiMessages.retryAfter, retryAfter)}`
              : errorMessage;
          }
          throw new Error(errorMessage);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error(uiMessages.noResponseBody);

        const decoder = new TextDecoder();
        let accumulatedContent = '';
        let buffer = '';

        const applyParsedEvent = (parsed: Record<string, unknown>) => {
          if (parsed.type === 'text') {
            accumulatedContent += String(parsed.content || '');
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessage.id
                  ? { ...msg, content: accumulatedContent }
                  : msg
              )
            );
            return;
          }

          if (parsed.type === 'sources') {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessage.id
                  ? {
                      ...msg,
                      sources: (parsed.sources as SourceCitation[]) || [],
                      isStreaming: false,
                      confidence:
                        typeof parsed.confidence === 'number'
                          ? parsed.confidence
                          : undefined,
                      model_used:
                        typeof parsed.model_used === 'string'
                          ? parsed.model_used
                          : undefined,
                      answered_from_sources_only:
                        typeof parsed.answered_from_sources_only === 'boolean'
                          ? parsed.answered_from_sources_only
                          : undefined,
                    }
                  : msg
              )
            );

            if (typeof parsed.conversation_id === 'string') {
              setConversationId(parsed.conversation_id);
            }
            return;
          }

          if (parsed.type === 'error') {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessage.id
                  ? {
                      ...msg,
                      content:
                        typeof parsed.content === 'string'
                          ? parsed.content
                          : uiMessages.streamError,
                      isStreaming: false,
                    }
                  : msg
              )
            );
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                applyParsedEvent(JSON.parse(data) as Record<string, unknown>);
              } catch {
                // Skip invalid JSON
              }
            }
          }
        }

        if (buffer.startsWith('data: ')) {
          try {
            applyParsedEvent(JSON.parse(buffer.slice(6)) as Record<string, unknown>);
          } catch {
            // Ignore trailing partial buffer
          }
        }

        // Mark as done streaming
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessage.id
              ? { ...msg, isStreaming: false }
              : msg
          )
        );
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;

        const displayError = error instanceof Error
          ? error.message
          : uiMessages.genericError;
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessage.id
              ? {
                  ...msg,
                  content: displayError,
                  isStreaming: false,
                }
              : msg
          )
        );
      } finally {
        setIsLoading(false);
      }
    },
    [agentId, conversationId, shareToken, uiMessages]
  );

  const resetChat = useCallback(() => {
    abortControllerRef.current?.abort();
    setMessages([]);
    setConversationId(null);
    sessionIdRef.current = uuidv4();
    setIsLoading(false);
  }, []);

  return {
    messages,
    isLoading,
    sendMessage,
    resetChat,
  };
}
