// =============================================
// Core types
// =============================================

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export type WorkspaceMode = 'agent' | 'data' | 'hybrid';

export interface AuthIntent {
  next: string;
  intent: string;
  contextLabel?: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  plan: 'free' | 'pro' | 'enterprise';
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Membership {
  id: string;
  org_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  created_at: string;
}

// =============================================
// Agent types
// =============================================

export type AgentStatus = 'draft' | 'pending' | 'crawling' | 'processing' | 'ready' | 'error';
export type AgentVisibility = 'public' | 'private' | 'passcode';
export type JobStage =
  | 'preflight'
  | 'queued'
  | 'discovering'
  | 'fetching'
  | 'embedding'
  | 'ready'
  | 'failed';

export interface Agent {
  id: string;
  org_id: string | null;
  user_id: string;
  name: string;
  slug: string;
  description: string | null;
  root_url: string;
  logo_url: string | null;
  status: AgentStatus;
  primary_locale: string;
  enabled_locales: string[];
  visibility: AgentVisibility;
  passcode_hash: string | null;
  embedding?: string | null;
  custom_domain?: string | null;
  custom_domain_verified?: boolean;
  crawl_stats: CrawlStats;
  created_at: string;
  updated_at: string;
}

export interface CompanyProfileFact {
  value: string;
  source_page_id?: string | null;
  source_url?: string | null;
}

export interface CompanyFaqFact {
  question: string;
  answer: string;
  source_page_id?: string | null;
  source_url?: string | null;
}

export interface CompanyContactProfile {
  email?: CompanyProfileFact | null;
  phone?: CompanyProfileFact | null;
  address?: CompanyProfileFact | null;
}

export interface CompanyProfileData {
  company_name?: string;
  industry?: CompanyProfileFact | null;
  description?: CompanyProfileFact | null;
  products?: CompanyProfileFact[];
  team?: CompanyProfileFact[];
  faqs?: CompanyFaqFact[];
  contact?: CompanyContactProfile | null;
  generated_at?: string;
}

export interface AgentCrawlOptions {
  stealth_mode?: boolean;
  proxy_url?: string;
  enable_ocr?: boolean;
  max_images_ocr?: number;
  enable_table_descriptions?: boolean;
  enable_youtube_transcripts?: boolean;
}

export interface AgentSettings {
  id: string;
  agent_id: string;
  system_prompt: string | null;
  welcome_message: string | null;
  starter_questions: string[];
  temperature: number;
  max_tokens: number;
  default_model: string;
  escalation_model: string;
  escalation_threshold: number;
  theme_color: string;
  company_profile?: CompanyProfileData | null;
  crawl_options?: AgentCrawlOptions | null;
  eval_dataset?: unknown[];
  created_at: string;
  updated_at: string;
}

export interface AgentDomain {
  id: string;
  agent_id: string;
  domain: string;
  is_primary: boolean;
  created_at: string;
}

export interface CrawlStats {
  total_pages?: number;
  crawled_pages?: number;
  total_chunks?: number;
  errors?: number;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
  discovered_urls?: number;
  pages_per_minute?: number;
  browser_render_share?: number;
  embed_queue_depth?: number;
  changed_pages?: number;
  eta_seconds?: number;
  current_stage?: JobStage;
}

// =============================================
// Share links
// =============================================

export interface ShareLink {
  id: string;
  agent_id: string;
  token: string;
  label: string | null;
  passcode_hash: string | null;
  expires_at: string | null;
  max_uses: number | null;
  use_count: number;
  revoked_at: string | null;
  created_by: string | null;
  created_at: string;
}

// =============================================
// Widget API keys
// =============================================

export interface WidgetApiKey {
  id: string;
  agent_id: string;
  public_key: string;
  label: string;
  allowed_origins: string[];
  rate_limit_per_minute: number;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface WidgetSession {
  id: string;
  api_key_id: string;
  agent_id: string;
  session_token: string;
  session_jti: string;
  origin: string | null;
  expires_at: string;
  created_at: string;
}

// =============================================
// Crawl system
// =============================================

export interface CrawlJob {
  id: string;
  agent_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  job_type: 'full' | 'incremental' | 'single_page';
  total_urls_discovered: number;
  total_urls_crawled: number;
  total_urls_skipped: number;
  total_urls_failed: number;
  total_chunks_created: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface CrawlJobMetrics {
  discovered_urls: number;
  crawled_urls: number;
  skipped_urls?: number;
  failed_urls: number;
  total_chunks?: number;
  pages_per_minute: number;
  browser_render_share: number;
  embed_queue_depth: number;
  changed_page_count?: number;
  changed_pages?: number;
  eta_minutes?: number | null;
  eta_seconds: number | null;
  failure_reason: string | null;
  current_stage: JobStage;
}

export type PageCrawlStatus = 'pending' | 'crawled' | 'skipped' | 'blocked' | 'failed';

export interface Page {
  id: string;
  agent_id: string;
  crawl_job_id: string | null;
  url: string;
  canonical_url: string | null;
  title: string | null;
  language: string;
  status_code: number | null;
  etag: string | null;
  last_modified: string | null;
  content_hash: string | null;
  robots_allowed: boolean;
  clean_markdown: string | null;
  previous_markdown?: string | null;
  synopsis?: string | null;
  change_summary?: {
    changed_at?: string;
    summary?: string;
    diff_size?: number;
  } | null;
  extraction_method?: 'readability' | 'cheerio' | 'llm' | null;
  structured_data?: Record<string, unknown> | null;
  raw_html_length: number;
  page_type: 'html' | 'pdf' | 'other';
  crawl_status: PageCrawlStatus;
  skip_reason: string | null;
  last_crawled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Chunk {
  id: string;
  agent_id: string;
  page_id: string | null;
  chunk_index: number;
  heading_path: string | null;
  content: string;
  snippet: string | null;
  language: string;
  token_count: number;
  rank_weight: number;
  content_hash: string | null;
  context_prefix?: string | null;
  quality_score?: number | null;
  created_at: string;
}

// =============================================
// Chat system
// =============================================

export interface Conversation {
  id: string;
  agent_id: string;
  session_id: string;
  share_link_id: string | null;
  title: string | null;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sources: SourceCitation[];
  model_used: string | null;
  confidence: number | null;
  token_usage: Record<string, number>;
  created_at: string;
}

export interface SourceCitation {
  chunk_id?: string;
  url: string;
  title: string;
  snippet: string;
  heading_path?: string;
  similarity?: number;
}

// =============================================
// Structured chat response (from Gemini)
// =============================================

export interface StructuredAnswer {
  answer: string;
  citations: {
    chunk_id: string;
    url: string;
    title: string;
    excerpt: string;
  }[];
  confidence: number;
  answered_from_sources_only: boolean;
  needs_recrawl: boolean;
}

// =============================================
// Job data
// =============================================

export interface CrawlJobData {
  agent_id: string;
  root_url: string;
  user_id: string;
  crawl_job_id: string;
  job_type: 'full' | 'incremental' | 'single_page';
  max_depth?: number;
  max_pages?: number;
  include_paths?: string[];
  exclude_paths?: string[];
  ignore_robots?: boolean;
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
  share_token?: string;
}

// =============================================
// Hybrid search results
// =============================================

export interface MatchedChunk {
  id: string;
  page_id: string | null;
  content: string;
  snippet: string | null;
  heading_path: string | null;
  language: string;
  context_prefix?: string | null;
  similarity: number;
  keyword_rank: number;
  combined_score: number;
}

// Legacy alias
export interface MatchedDocument {
  id: string;
  content: string;
  metadata: {
    source_url?: string;
    page_title?: string;
    section_heading?: string;
    chunk_index?: number;
  };
  similarity: number;
}
