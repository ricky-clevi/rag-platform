export interface AgentConfig {
  id: string;
  name: string;
  welcomeMessage: string | null;
  starterQuestions: string[];
  themeColor: string;
}

export interface StreamEvent {
  type: 'text' | 'sources' | 'done' | 'error';
  content?: string;
  sources?: SourceCitation[];
  conversationId?: string;
  confidence?: number | null;
  modelUsed?: string;
  answeredFromSourcesOnly?: boolean;
  messageId?: string;
  message?: string;
}

export interface SourceCitation {
  chunk_id?: string;
  url: string;
  title: string;
  snippet: string;
  heading_path?: string;
  similarity?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: SourceCitation[];
  isStreaming?: boolean;
  confidence?: number | null;
  modelUsed?: string;
  answeredFromSourcesOnly?: boolean;
  serverMessageId?: string;
}

export interface AgentForgeChatProps {
  apiKey: string;
  baseUrl?: string;
  position?: 'bottom-right' | 'bottom-left';
  theme?: 'light' | 'dark' | 'auto';
  primaryColor?: string;
  bubbleIcon?: string;
  width?: number;
  height?: number;
  openOnLoad?: boolean;
  persistConversation?: boolean;
  showSources?: boolean;
  showPoweredBy?: boolean;
  onOpen?: () => void;
  onClose?: () => void;
  onMessage?: (msg: ChatMessage) => void;
  onError?: (err: Error) => void;
}
