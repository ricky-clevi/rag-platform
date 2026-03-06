-- =============================================
-- AgentForge Production Schema v2
-- 768-dim embeddings, hybrid search, organizations,
-- share links, crawl jobs, audit logs
-- =============================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

-- =============================================
-- Core tables
-- =============================================

-- User profiles (extends Supabase Auth)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Organizations (multi-tenant)
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Organization memberships
CREATE TABLE memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);

-- =============================================
-- Agent tables
-- =============================================

-- Agents (one per crawled company)
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  root_url TEXT NOT NULL,
  logo_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('draft', 'pending', 'crawling', 'processing', 'ready', 'error')),
  primary_locale TEXT NOT NULL DEFAULT 'en',
  enabled_locales TEXT[] DEFAULT ARRAY['en'],
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private', 'passcode')),
  passcode_hash TEXT,
  crawl_stats JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent settings (separate table for cleaner schema)
CREATE TABLE agent_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE UNIQUE,
  system_prompt TEXT,
  welcome_message TEXT,
  starter_questions TEXT[] DEFAULT '{}',
  temperature FLOAT DEFAULT 0.7,
  max_tokens INT DEFAULT 2048,
  default_model TEXT DEFAULT 'gemini-3.1-flash-lite-preview',
  escalation_model TEXT DEFAULT 'gemini-3.1-pro-preview',
  escalation_threshold FLOAT DEFAULT 0.6,
  theme_color TEXT DEFAULT '#171717',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent allowed domains (scope control)
CREATE TABLE agent_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_id, domain)
);

-- =============================================
-- Share links
-- =============================================

CREATE TABLE share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  label TEXT,
  passcode_hash TEXT,
  expires_at TIMESTAMPTZ,
  max_uses INT,
  use_count INT DEFAULT 0,
  revoked_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- Crawl system
-- =============================================

-- Crawl jobs (tracks each crawl run)
CREATE TABLE crawl_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  job_type TEXT NOT NULL DEFAULT 'full' CHECK (job_type IN ('full', 'incremental', 'single_page')),
  total_urls_discovered INT DEFAULT 0,
  total_urls_crawled INT DEFAULT 0,
  total_urls_skipped INT DEFAULT 0,
  total_urls_failed INT DEFAULT 0,
  total_chunks_created INT DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Crawled pages (comprehensive)
CREATE TABLE pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  crawl_job_id UUID REFERENCES crawl_jobs(id) ON DELETE SET NULL,
  url TEXT NOT NULL,
  canonical_url TEXT,
  title TEXT,
  language TEXT DEFAULT 'en',
  status_code INT,
  etag TEXT,
  last_modified TEXT,
  content_hash TEXT,
  robots_allowed BOOLEAN DEFAULT true,
  clean_markdown TEXT,
  raw_html_length INT DEFAULT 0,
  page_type TEXT DEFAULT 'html' CHECK (page_type IN ('html', 'pdf', 'other')),
  crawl_status TEXT DEFAULT 'pending'
    CHECK (crawl_status IN ('pending', 'crawled', 'skipped', 'blocked', 'failed')),
  skip_reason TEXT,
  last_crawled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_id, url)
);

-- Document chunks with embeddings (768 dims for gemini-embedding-001 reduced)
CREATE TABLE chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  page_id UUID REFERENCES pages(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL DEFAULT 0,
  heading_path TEXT,
  content TEXT NOT NULL,
  snippet TEXT,
  embedding VECTOR(768),
  fts TSVECTOR,
  language TEXT DEFAULT 'en',
  token_count INT DEFAULT 0,
  rank_weight FLOAT DEFAULT 1.0,
  content_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- Chat system
-- =============================================

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  share_link_id UUID REFERENCES share_links(id),
  title TEXT,
  message_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  sources JSONB DEFAULT '[]',
  model_used TEXT,
  confidence FLOAT,
  token_usage JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- Recrawl policies
-- =============================================

CREATE TABLE recrawl_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE UNIQUE,
  enabled BOOLEAN DEFAULT false,
  frequency_hours INT DEFAULT 168,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- Usage & audit
-- =============================================

CREATE TABLE usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('chat', 'crawl', 'embed', 'share_view')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- Triggers
-- =============================================

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name');
  -- Auto-create personal org
  INSERT INTO public.organizations (name, slug, owner_id)
  VALUES (
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)) || '''s Workspace',
    'ws-' || substr(new.id::text, 1, 8),
    new.id
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-create agent settings when agent is created
CREATE OR REPLACE FUNCTION public.handle_new_agent()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.agent_settings (agent_id)
  VALUES (new.id);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_agent_created
  AFTER INSERT ON agents
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_agent();

-- Auto-update tsvector on chunk insert/update
-- Maps locale codes (en, ko, etc.) to Postgres text search configurations
CREATE OR REPLACE FUNCTION chunks_fts_trigger()
RETURNS TRIGGER AS $$
DECLARE
  lang TEXT;
  cfg  REGCONFIG;
BEGIN
  lang := LOWER(COALESCE(NULLIF(TRIM(NEW.language), ''), 'en'));

  cfg := CASE
    WHEN lang = 'english' THEN 'english'::regconfig
    WHEN lang LIKE 'en%'  THEN 'english'::regconfig
    WHEN lang LIKE 'ko%'  THEN 'simple'::regconfig
    WHEN lang LIKE 'ja%'  THEN 'simple'::regconfig
    WHEN lang LIKE 'zh%'  THEN 'simple'::regconfig
    WHEN lang LIKE 'de%'  THEN 'german'::regconfig
    WHEN lang LIKE 'fr%'  THEN 'french'::regconfig
    WHEN lang LIKE 'es%'  THEN 'spanish'::regconfig
    WHEN lang LIKE 'pt%'  THEN 'portuguese'::regconfig
    WHEN lang LIKE 'it%'  THEN 'italian'::regconfig
    WHEN lang LIKE 'nl%'  THEN 'dutch'::regconfig
    WHEN lang LIKE 'ru%'  THEN 'russian'::regconfig
    WHEN lang LIKE 'sv%'  THEN 'swedish'::regconfig
    WHEN lang LIKE 'da%'  THEN 'danish'::regconfig
    WHEN lang LIKE 'fi%'  THEN 'finnish'::regconfig
    WHEN lang LIKE 'no%'  THEN 'norwegian'::regconfig
    WHEN lang LIKE 'tr%'  THEN 'turkish'::regconfig
    WHEN lang LIKE 'hu%'  THEN 'hungarian'::regconfig
    WHEN lang LIKE 'ro%'  THEN 'romanian'::regconfig
    ELSE 'simple'::regconfig
  END;

  NEW.fts := to_tsvector(cfg, NEW.content);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER chunks_fts_update
  BEFORE INSERT OR UPDATE OF content ON chunks
  FOR EACH ROW EXECUTE FUNCTION chunks_fts_trigger();

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON agents FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_agent_settings_updated_at BEFORE UPDATE ON agent_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_pages_updated_at BEFORE UPDATE ON pages FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- Indexes
-- =============================================

-- Primary lookups
CREATE INDEX idx_organizations_owner ON organizations(owner_id);
CREATE INDEX idx_memberships_org ON memberships(org_id);
CREATE INDEX idx_memberships_user ON memberships(user_id);
CREATE INDEX idx_agents_user_id ON agents(user_id);
CREATE INDEX idx_agents_org_id ON agents(org_id);
CREATE INDEX idx_agents_slug ON agents(slug);
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_agent_domains_agent ON agent_domains(agent_id);
CREATE INDEX idx_share_links_agent ON share_links(agent_id);
CREATE INDEX idx_share_links_token ON share_links(token);
CREATE INDEX idx_crawl_jobs_agent ON crawl_jobs(agent_id);
CREATE INDEX idx_pages_agent_id ON pages(agent_id);
CREATE INDEX idx_pages_crawl_job ON pages(crawl_job_id);
CREATE INDEX idx_pages_content_hash ON pages(agent_id, content_hash);
CREATE INDEX idx_chunks_agent_id ON chunks(agent_id);
CREATE INDEX idx_chunks_page_id ON chunks(page_id);
CREATE INDEX idx_conversations_agent_id ON conversations(agent_id);
CREATE INDEX idx_conversations_session ON conversations(session_id);
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_usage_events_agent ON usage_events(agent_id);
CREATE INDEX idx_audit_logs_agent ON audit_logs(agent_id);

-- HNSW vector index (768 dims fits within regular vector index limit)
CREATE INDEX idx_chunks_embedding ON chunks
  USING hnsw (embedding vector_cosine_ops);

-- Full-text search index
CREATE INDEX idx_chunks_fts ON chunks USING gin(fts);

-- =============================================
-- RPC functions
-- =============================================

-- Hybrid search: vector similarity + full-text, combined score
CREATE OR REPLACE FUNCTION hybrid_search(
  query_embedding VECTOR(768),
  query_text TEXT,
  match_agent_id UUID,
  match_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 8,
  keyword_weight FLOAT DEFAULT 0.3,
  semantic_weight FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  id UUID,
  page_id UUID,
  content TEXT,
  snippet TEXT,
  heading_path TEXT,
  language TEXT,
  similarity FLOAT,
  keyword_rank FLOAT,
  combined_score FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH semantic AS (
    SELECT
      c.id,
      c.page_id,
      c.content,
      c.snippet,
      c.heading_path,
      c.language,
      (1 - (c.embedding <=> query_embedding)) AS sim_score
    FROM chunks c
    WHERE c.agent_id = match_agent_id
      AND (1 - (c.embedding <=> query_embedding)) > match_threshold
    ORDER BY c.embedding <=> query_embedding
    LIMIT match_count * 2
  ),
  keyword AS (
    SELECT
      c.id,
      ts_rank_cd(c.fts, websearch_to_tsquery('english', query_text)) AS kw_rank
    FROM chunks c
    WHERE c.agent_id = match_agent_id
      AND c.fts @@ websearch_to_tsquery('english', query_text)
    LIMIT match_count * 2
  )
  SELECT
    s.id,
    s.page_id,
    s.content,
    s.snippet,
    s.heading_path,
    s.language,
    s.sim_score AS similarity,
    COALESCE(k.kw_rank, 0.0)::FLOAT AS keyword_rank,
    (semantic_weight * s.sim_score + keyword_weight * COALESCE(k.kw_rank, 0.0))::FLOAT AS combined_score
  FROM semantic s
  LEFT JOIN keyword k ON k.id = s.id
  ORDER BY (semantic_weight * s.sim_score + keyword_weight * COALESCE(k.kw_rank, 0.0)) DESC
  LIMIT match_count;
END;
$$;

-- Simple vector-only search (fallback)
CREATE OR REPLACE FUNCTION match_chunks(
  query_embedding VECTOR(768),
  match_agent_id UUID,
  match_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  snippet TEXT,
  heading_path TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.content,
    c.snippet,
    c.heading_path,
    (1 - (c.embedding <=> query_embedding))::FLOAT AS similarity
  FROM chunks c
  WHERE c.agent_id = match_agent_id
    AND (1 - (c.embedding <=> query_embedding)) > match_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- =============================================
-- Row Level Security
-- =============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE crawl_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE recrawl_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Organizations
CREATE POLICY "Org members can view" ON organizations FOR SELECT
  USING (id IN (SELECT org_id FROM memberships WHERE user_id = auth.uid()));
CREATE POLICY "Org owners can manage" ON organizations FOR ALL
  USING (owner_id = auth.uid());

-- Memberships
CREATE POLICY "Org members can view memberships" ON memberships FOR SELECT
  USING (org_id IN (SELECT org_id FROM memberships m2 WHERE m2.user_id = auth.uid()));
CREATE POLICY "Org admins can manage memberships" ON memberships FOR ALL
  USING (org_id IN (SELECT org_id FROM memberships m2 WHERE m2.user_id = auth.uid() AND m2.role IN ('owner', 'admin')));

-- Agents
CREATE POLICY "Users can manage own agents" ON agents FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Public agents viewable by all" ON agents FOR SELECT USING (visibility = 'public');

-- Agent settings
CREATE POLICY "Agent owners can manage settings" ON agent_settings FOR ALL
  USING (agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()));
CREATE POLICY "Public agent settings viewable" ON agent_settings FOR SELECT
  USING (agent_id IN (SELECT id FROM agents WHERE visibility = 'public'));

-- Agent domains
CREATE POLICY "Agent owners manage domains" ON agent_domains FOR ALL
  USING (agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()));

-- Share links
CREATE POLICY "Agent owners manage share links" ON share_links FOR ALL
  USING (agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()));

-- Crawl jobs
CREATE POLICY "Agent owners view crawl jobs" ON crawl_jobs FOR ALL
  USING (agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()));

-- Pages
CREATE POLICY "Agent owners manage pages" ON pages FOR ALL
  USING (agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()));
CREATE POLICY "Public agent pages viewable" ON pages FOR SELECT
  USING (agent_id IN (SELECT id FROM agents WHERE visibility = 'public'));

-- Chunks
CREATE POLICY "Agent owners manage chunks" ON chunks FOR ALL
  USING (agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()));
CREATE POLICY "Public agent chunks viewable" ON chunks FOR SELECT
  USING (agent_id IN (SELECT id FROM agents WHERE visibility = 'public'));

-- Conversations (anyone can chat with accessible agents)
CREATE POLICY "Anyone can converse with public agents" ON conversations FOR ALL
  USING (agent_id IN (SELECT id FROM agents WHERE visibility IN ('public', 'passcode')));
CREATE POLICY "Agent owners view all conversations" ON conversations FOR SELECT
  USING (agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()));

-- Messages
CREATE POLICY "Messages accessible via conversation" ON messages FOR ALL
  USING (conversation_id IN (SELECT id FROM conversations));

-- Recrawl policies
CREATE POLICY "Agent owners manage recrawl policies" ON recrawl_policies FOR ALL
  USING (agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()));

-- Usage events (read-only for owners, service role inserts)
CREATE POLICY "Agent owners view usage" ON usage_events FOR SELECT
  USING (agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()));

-- Audit logs
CREATE POLICY "Agent owners view audit logs" ON audit_logs FOR SELECT
  USING (agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()));
