import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChatBubble } from './ChatBubble';
import { ChatPanel } from './ChatPanel';
import { SessionManager } from '../core/session';
import { ConversationStorage } from '../core/storage';
import type { AgentForgeChatProps, AgentConfig, ChatMessage } from '../types';

const DEFAULT_BASE_URL = 'https://agentforge.ai';

export function AgentForgeChat({
  apiKey,
  baseUrl = DEFAULT_BASE_URL,
  position = 'bottom-right',
  theme = 'auto',
  primaryColor,
  bubbleIcon,
  width,
  height,
  openOnLoad = false,
  persistConversation = false,
  showSources = true,
  showPoweredBy = true,
  onOpen,
  onClose,
  onMessage,
  onError,
}: AgentForgeChatProps) {
  const [isOpen, setIsOpen] = useState(openOnLoad);
  const [agent, setAgent] = useState<AgentConfig | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | undefined>();

  const sessionRef = useRef<SessionManager | null>(null);
  const storageRef = useRef<ConversationStorage | null>(null);
  const initRef = useRef(false);

  // Resolve theme
  const resolvedTheme = theme === 'auto'
    ? (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;

  // Initialize session
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const session = new SessionManager(apiKey, baseUrl);
    sessionRef.current = session;

    session.initialize()
      .then((config) => {
        setAgent(config);

        // Initialize storage
        const storage = new ConversationStorage(config.id, persistConversation);
        storageRef.current = storage;

        // Restore persisted conversation
        const savedConvId = storage.getConversationId();
        const savedMessages = storage.getMessages();
        if (savedConvId && savedMessages.length > 0) {
          setConversationId(savedConvId);
          setMessages(savedMessages);
        }
      })
      .catch((err) => {
        setError(err.message);
        onError?.(err);
      });

    return () => {
      session.destroy();
    };
  }, [apiKey, baseUrl, persistConversation, onError]);

  // Listen for programmatic control events from embed.ts (window.AgentForge.open/close/toggle)
  useEffect(() => {
    const host = document.getElementById('agentforge-widget');
    if (!host) return;

    const handleOpen = () => setIsOpen(true);
    const handleClose = () => setIsOpen(false);
    const handleToggleEvent = () => setIsOpen((prev) => !prev);

    host.addEventListener('af:open', handleOpen);
    host.addEventListener('af:close', handleClose);
    host.addEventListener('af:toggle', handleToggleEvent);

    return () => {
      host.removeEventListener('af:open', handleOpen);
      host.removeEventListener('af:close', handleClose);
      host.removeEventListener('af:toggle', handleToggleEvent);
    };
  }, []);

  // Apply custom primary color as CSS variable
  const containerStyle = primaryColor
    ? { '--af-primary': primaryColor, '--af-user-bg': primaryColor } as React.CSSProperties
    : undefined;

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      if (next) onOpen?.();
      else onClose?.();
      return next;
    });
  }, [onOpen, onClose]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    onClose?.();
  }, [onClose]);

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setConversationId(undefined);
    storageRef.current?.clear();
  }, []);

  const handleSend = useCallback(async (content: string) => {
    const client = sessionRef.current?.getClient();
    if (!client) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
    };

    const assistantMsg: ChatMessage = {
      id: `asst-${Date.now()}`,
      role: 'assistant',
      content: '',
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsLoading(true);
    setError(null);

    try {
      const stream = client.sendMessage(content, conversationId);
      let fullContent = '';
      let newConvId = conversationId;

      for await (const event of stream) {
        if (event.type === 'text' && event.content) {
          fullContent += event.content;
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === 'assistant') {
              updated[updated.length - 1] = { ...last, content: fullContent };
            }
            return updated;
          });
        } else if (event.type === 'sources') {
          newConvId = event.conversationId || newConvId;
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === 'assistant') {
              updated[updated.length - 1] = {
                ...last,
                sources: event.sources,
                confidence: event.confidence,
                modelUsed: event.modelUsed,
                answeredFromSourcesOnly: event.answeredFromSourcesOnly,
                serverMessageId: event.messageId,
                isStreaming: false,
              };
            }
            return updated;
          });
        } else if (event.type === 'error') {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === 'assistant') {
              updated[updated.length - 1] = {
                ...last,
                content: event.message || 'An error occurred',
                isStreaming: false,
              };
            }
            return updated;
          });
        } else if (event.type === 'done') {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === 'assistant' && last.isStreaming) {
              updated[updated.length - 1] = { ...last, isStreaming: false };
            }
            return updated;
          });
        }
      }

      // Update conversation ID
      if (newConvId && newConvId !== conversationId) {
        setConversationId(newConvId);
        storageRef.current?.setConversationId(newConvId);
      }

      // Persist messages
      setMessages((prev) => {
        storageRef.current?.setMessages(prev);
        const lastMsg = prev[prev.length - 1];
        if (lastMsg) onMessage?.(lastMsg);
        return prev;
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.role === 'assistant') {
          updated[updated.length - 1] = {
            ...last,
            content: `Error: ${error.message}`,
            isStreaming: false,
          };
        }
        return updated;
      });
      onError?.(error);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, onMessage, onError]);

  if (error && !agent) {
    // Silent fail - just show bubble that shows error on click
    return null;
  }

  return (
    <div data-theme={resolvedTheme} style={containerStyle}>
      <ChatBubble
        position={position}
        isOpen={isOpen}
        onClick={handleToggle}
        primaryColor={primaryColor}
        bubbleIcon={bubbleIcon}
      />
      {agent && (
        <ChatPanel
          isOpen={isOpen}
          position={position}
          agent={agent}
          messages={messages}
          isLoading={isLoading}
          showSources={showSources}
          showPoweredBy={showPoweredBy}
          width={width}
          height={height}
          onSend={handleSend}
          onClose={handleClose}
          onNewChat={handleNewChat}
        />
      )}
    </div>
  );
}
