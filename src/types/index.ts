export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export type AgentStatus = 'pending' | 'crawling' | 'processing' | 'ready' | 'error';

export interface Agent {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  description: string | null;
  website_url: string;
  logo_url: string | null;
  status: AgentStatus;
  is_public: boolean;
  crawl_stats: CrawlStats;
  settings: AgentSettings;
  created_at: string;
  updated_at: string;
}

export interface CrawlStats {
  total_pages?: number;
  crawled_pages?: number;
  total_chunks?: number;
  errors?: number;
  started_at?: string;
  completed_at?: string;
}

export interface AgentSettings {
  system_prompt?: string;
  temperature?: number;
  max_tokens?: number;
  welcome_message?: string;
  theme_color?: string;
}

export interface Page {
  id: string;
  agent_id: string;
  url: string;
  title: string | null;
  content: string | null;
  metadata: Record<string, unknown>;
  crawled_at: string;
}

export interface Document {
  id: string;
  agent_id: string;
  page_id: string | null;
  content: string;
  metadata: DocumentMetadata;
  embedding: number[] | null;
  created_at: string;
}

export interface DocumentMetadata {
  source_url?: string;
  page_title?: string;
  section_heading?: string;
  chunk_index?: number;
}

export interface Conversation {
  id: string;
  agent_id: string;
  session_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  sources: SourceCitation[];
  created_at: string;
}

export interface SourceCitation {
  url: string;
  title: string;
  snippet: string;
}

export interface CrawlJobData {
  agent_id: string;
  website_url: string;
  user_id: string;
}

export interface CrawlProgress {
  agent_id: string;
  status: AgentStatus;
  crawled_pages: number;
  total_pages: number;
  current_url?: string;
  errors: number;
}

export interface ChatRequest {
  agent_id: string;
  message: string;
  conversation_id?: string;
  session_id: string;
}

export interface MatchedDocument {
  id: string;
  content: string;
  metadata: DocumentMetadata;
  similarity: number;
}
