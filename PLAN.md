# AgentForge RAG Platform — Architecture & Implementation Plan

## Overview

A full-stack platform where users input a company's website URL, the system crawls all accessible pages, stores the content as vector embeddings, and creates a dedicated AI chatbot agent for that company. Each agent is shareable via a unique URL path (or custom domain/subdomain) and can answer questions about the company using hybrid RAG (vector + full-text search). Agents support public, private, and passcode-protected visibility, share links with expiry/usage limits, scheduled recrawls, analytics, and multi-tenant organization management.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript |
| UI | shadcn/ui + Tailwind CSS v4 + Radix UI |
| Database | Supabase (PostgreSQL 15) |
| Vector DB | Supabase pgvector extension (768 dimensions) |
| Full-Text Search | PostgreSQL tsvector + pg_trgm |
| Auth | Supabase Auth (GoTrue — email/password) |
| LLM (Chat) | Gemini 3.1 Flash Lite (`gemini-3.1-flash-lite-preview`) via `@google/genai` |
| LLM (Escalation) | Gemini 3.1 Pro (`gemini-3.1-pro-preview`) — auto-escalation when confidence < 0.4 |
| Embeddings | Gemini Embedding (`gemini-embedding-001`, 768 dims) |
| Web Crawling | Hybrid: HTTP (fetch + cheerio) + headless browser (Puppeteer-core) fallback + PDF extraction (Gemini) |
| i18n | next-intl v4 (English + Korean) |
| Deployment | Docker (multi-stage) — self-hosted |
| Queue/Jobs | BullMQ + Redis 7 (for background crawl jobs) |
| API Gateway | Kong 2.8.1 (local Supabase stack) |
| Validation | Zod v4 |
| Security | bcryptjs (passcodes), rate limiting, bot detection, RLS policies |

---

## Architecture

```
+-----------------------------------------------------------+
|                  Next.js 16 App (Frontend)                 |
|  +----------+  +----------+  +-----------+  +-----------+ |
|  | Landing  |  | Dashboard|  |   Agent   |  |   Chat    | |
|  |  Page    |  |  (Auth)  |  |  Builder  |  | Interface | |
|  +----------+  +----------+  +-----------+  +-----------+ |
|  +----------+  +----------+  +-----------+                |
|  | Org Mgmt |  | Analytics|  | Eval/Diff |                |
|  +----------+  +----------+  +-----------+                |
+-----------------------------------------------------------+
|                  Next.js API Routes (22 endpoints)         |
|  +----------+  +----------+  +-----------+  +-----------+ |
|  | /api/    |  | /api/    |  | /api/     |  | /api/     | |
|  | agents   |  | crawl    |  | chat      |  | webhooks  | |
|  +----------+  +----------+  +-----------+  +-----------+ |
|  +----------+  +----------+  +-----------+                |
|  | /api/    |  | /api/    |  | /api/     |                |
|  | orgs     |  | metrics  |  | health    |                |
|  +----------+  +----------+  +-----------+                |
+-----------------------------------------------------------+
|                  Background Services                       |
|  +----------------------------------------------------+   |
|  |  BullMQ Worker (Crawl + Embed Pipeline)             |   |
|  |  1. Fetch pages (HTTP -> Puppeteer -> PDF)          |   |
|  |  2. Extract & clean text (HTML -> markdown)         |   |
|  |  3. Chunk text (~500 tokens, ~50 token overlap)     |   |
|  |  4. Deduplicate (shingle-based + content hash)      |   |
|  |  5. Generate embeddings (Gemini, 768-dim)           |   |
|  |  6. Store in Supabase pgvector + tsvector           |   |
|  +----------------------------------------------------+   |
|  +---------------------+  +----------------------------+  |
|  | Recrawl Scheduler   |  | Nightly Eval Runner        |  |
|  | (polls every 60s)   |  | (runs eval datasets)       |  |
|  +---------------------+  +----------------------------+  |
+-----------------------------------------------------------+
|                    Data Layer                               |
|  +----------+  +--------------+  +--------+               |
|  | Supabase |  | pgvector +   |  | Redis  |               |
|  | Postgres |  | tsvector     |  | (jobs) |               |
|  | (15 RLS) |  | (hybrid srch)|  |        |               |
|  +----------+  +--------------+  +--------+               |
+-----------------------------------------------------------+
```

---

## Database Schema

### Extensions

```sql
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;   -- pgvector
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;  -- trigram fuzzy search
```

### Tables

```sql
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
  quota_agents INT DEFAULT 5,
  quota_pages_per_agent INT DEFAULT 500,
  quota_messages_per_month INT DEFAULT 10000,
  current_month_messages INT DEFAULT 0,
  billing_status TEXT DEFAULT 'active'
    CHECK (billing_status IN ('active', 'suspended', 'cancelled')),
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
  visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'private', 'passcode')),
  passcode_hash TEXT,
  custom_domain TEXT,
  custom_domain_verified BOOLEAN DEFAULT false,
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
  eval_dataset JSONB DEFAULT '[]',
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

-- Share links (token-based access with expiry)
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

-- Crawl jobs (tracks each crawl run)
CREATE TABLE crawl_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  job_type TEXT NOT NULL DEFAULT 'full'
    CHECK (job_type IN ('full', 'incremental', 'single_page')),
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

-- Crawled pages
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
  previous_markdown TEXT,
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

-- Document chunks with embeddings
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

-- Chat conversations
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

-- Chat messages
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

-- Recrawl policies (scheduled recrawling)
CREATE TABLE recrawl_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE UNIQUE,
  enabled BOOLEAN DEFAULT false,
  frequency_hours INT DEFAULT 168,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Usage events (analytics)
CREATE TABLE usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('chat', 'crawl', 'embed', 'share_view', 'agent_created')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit logs (compliance)
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Indexes (22 total)

```sql
-- Primary lookups
CREATE INDEX idx_organizations_owner ON organizations(owner_id);
CREATE INDEX idx_memberships_org ON memberships(org_id);
CREATE INDEX idx_memberships_user ON memberships(user_id);
CREATE INDEX idx_agents_user_id ON agents(user_id);
CREATE INDEX idx_agents_org_id ON agents(org_id);
CREATE INDEX idx_agents_slug ON agents(slug);
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_agents_custom_domain ON agents(custom_domain) WHERE custom_domain IS NOT NULL;
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

-- Vector similarity search (HNSW)
CREATE INDEX idx_chunks_embedding ON chunks USING hnsw (embedding vector_cosine_ops);

-- Full-text search (GIN)
CREATE INDEX idx_chunks_fts ON chunks USING gin(fts);
```

### RPC Functions

```sql
-- Hybrid search: vector similarity (0.7) + full-text keyword (0.3), weighted by rank_weight
hybrid_search(query_embedding, query_text, match_agent_id, match_threshold, match_count, keyword_weight, semantic_weight)

-- Simple vector-only search (fallback)
match_chunks(query_embedding, match_agent_id, match_threshold, match_count)

-- Analytics aggregation (30-day default)
get_agent_analytics(p_agent_id, p_days)
```

### Triggers (7)

- `on_auth_user_created` — auto-creates profile + personal organization on signup
- `on_agent_created` — auto-creates agent_settings row
- `chunks_fts_update` — auto-updates tsvector on chunk insert/update
- `update_*_updated_at` (4) — auto-timestamps on profiles, organizations, agents, agent_settings, pages, conversations

### Row-Level Security

15 RLS policies covering all tables, enforcing:
- Users can only manage their own profiles, agents, and related resources
- Public agents and their content are readable by all
- Organization access controlled by membership role (owner/admin/member)
- Messages accessible via conversation chain

---

## Directory Structure

```
rag-platform/
├── .env.local.example
├── .env.local
├── Dockerfile                        # Multi-stage (base -> deps -> builder -> runner)
├── docker-compose.yml                # 8 services: DB, Redis, Auth, REST, Kong, Studio, Meta, Inbucket
├── next.config.ts
├── tsconfig.json
├── package.json
├── postcss.config.mjs
├── eslint.config.mjs
├── components.json                   # shadcn/ui config
├── PLAN.md
├── README.md
├── messages/
│   ├── en.json                       # English translations (160 keys)
│   └── ko.json                       # Korean translations (160 keys)
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql    # Core schema, indexes, RPC, RLS, triggers
│       ├── 002_feature_additions.sql # Eval datasets, quotas, custom domains, analytics RPC
│       └── 003_usage_event_types.sql # Expanded usage event types
├── volumes/
│   └── api/
│       └── kong.yml                  # Kong API gateway declarative config
├── public/                           # Static assets (SVGs, favicon)
├── src/
│   ├── middleware.ts                 # i18n + subdomain + custom domain routing
│   ├── app/
│   │   ├── globals.css              # Tailwind v4 (@import "tailwindcss")
│   │   ├── layout.tsx               # Root layout
│   │   ├── [locale]/
│   │   │   ├── layout.tsx           # Locale layout with i18n provider
│   │   │   ├── page.tsx             # Landing page (hero, features, CTA)
│   │   │   ├── (auth)/
│   │   │   │   ├── login/page.tsx
│   │   │   │   └── signup/page.tsx
│   │   │   ├── (dashboard)/
│   │   │   │   ├── layout.tsx       # Dashboard layout (sidebar + auth guard)
│   │   │   │   ├── dashboard/page.tsx
│   │   │   │   ├── organizations/page.tsx
│   │   │   │   └── agents/
│   │   │   │       ├── page.tsx          # Agent list/grid
│   │   │   │       ├── new/page.tsx      # Create agent (URL input + crawl)
│   │   │   │       └── [id]/
│   │   │   │           ├── page.tsx      # Agent detail/settings
│   │   │   │           ├── analytics/page.tsx
│   │   │   │           ├── diff/page.tsx # Content diff between crawls
│   │   │   │           └── eval/page.tsx # Eval test cases + runs
│   │   │   └── agent/
│   │   │       └── [slug]/
│   │   │           ├── page.tsx     # Public chat (server component)
│   │   │           └── client.tsx   # Chat client component
│   │   └── api/
│   │       ├── health/route.ts              # GET — health check
│   │       ├── metrics/route.ts             # GET — Prometheus metrics (optional API key)
│   │       ├── agents/
│   │       │   ├── route.ts                 # GET (list) + POST (create + start crawl)
│   │       │   └── [id]/
│   │       │       ├── route.ts             # GET + PATCH + DELETE
│   │       │       ├── verify-passcode/route.ts
│   │       │       ├── share-links/
│   │       │       │   ├── route.ts         # GET + POST
│   │       │       │   └── [linkId]/route.ts # DELETE (revoke)
│   │       │       ├── pages/route.ts       # GET (paginated crawled pages)
│   │       │       ├── domains/route.ts     # GET + POST + DELETE
│   │       │       ├── analytics/route.ts   # GET (30-day stats via RPC)
│   │       │       ├── file-search/route.ts # POST (Gemini Files API upload)
│   │       │       ├── generate-starters/route.ts  # POST (AI-generated starter questions)
│   │       │       ├── recrawl-policy/route.ts     # GET + PUT + DELETE
│   │       │       ├── custom-domain/route.ts      # GET + PUT + DELETE
│   │       │       ├── diff/route.ts        # GET (page content diff)
│   │       │       └── eval/route.ts        # GET + PUT + POST (run eval)
│   │       ├── crawl/
│   │       │   ├── route.ts                 # POST (start crawl job)
│   │       │   └── status/route.ts          # GET (?agent_id= query param)
│   │       ├── chat/
│   │       │   └── route.ts                 # POST (streaming SSE chat with RAG)
│   │       ├── organizations/
│   │       │   ├── route.ts                 # GET + POST
│   │       │   └── [orgId]/
│   │       │       └── members/route.ts     # GET + POST + DELETE (RBAC)
│   │       └── webhooks/
│   │           └── crawler/route.ts         # POST (worker callbacks: started/progress/completed/failed)
│   ├── components/
│   │   ├── ui/                       # shadcn/ui primitives (button, card, input, badge, etc.)
│   │   ├── layout/
│   │   │   ├── header.tsx            # Logo, nav, language switcher, auth
│   │   │   ├── sidebar.tsx           # Desktop sidebar + mobile bottom nav
│   │   │   └── footer.tsx
│   │   ├── agent/
│   │   │   ├── url-input.tsx         # Browser-style URL bar with globe icon
│   │   │   ├── agent-card.tsx        # Agent card (status, stats, actions)
│   │   │   ├── agent-status.tsx      # Color-coded status badge with pulse animation
│   │   │   └── crawl-progress.tsx    # Real-time progress bar with 2s polling
│   │   ├── chat/
│   │   │   ├── chat-interface.tsx    # Full chat UI (header, messages, starter questions)
│   │   │   ├── message-bubble.tsx    # Message with confidence badge + citation drawer
│   │   │   ├── chat-input.tsx        # Auto-growing textarea (Enter/Shift+Enter)
│   │   │   ├── source-citation.tsx   # Inline citation badges
│   │   │   ├── citation-drawer.tsx   # Collapsible drawer (3 previews + expand)
│   │   │   ├── passcode-gate.tsx     # Lock icon + password input for protected agents
│   │   │   └── confidence-badge.tsx  # Color-coded shield (green/yellow/red)
│   │   └── common/
│   │       ├── language-switcher.tsx  # EN/Korean toggle with globe icon
│   │       └── loading-states.tsx    # Spinner, FullPageLoader, CardSkeleton
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts            # Browser Supabase client
│   │   │   ├── server.ts            # Server Supabase client (service role)
│   │   │   └── middleware.ts         # Auth session + protected route middleware
│   │   ├── gemini/
│   │   │   ├── client.ts            # GoogleGenAI singleton, model constants
│   │   │   ├── embeddings.ts        # 768-dim embeddings (batch processing, L2 normalized)
│   │   │   ├── chat.ts              # Structured RAG response + streaming + confidence escalation
│   │   │   └── live-verification.ts # Freshness detection + Google Search/URL tools
│   │   ├── crawler/
│   │   │   ├── index.ts             # Orchestrator (full/incremental/single_page crawls)
│   │   │   ├── http-crawler.ts      # fetch + cheerio (conditional requests, etag/304)
│   │   │   ├── browser-crawler.ts   # Puppeteer-core fallback for JS-heavy sites
│   │   │   ├── content-extractor.ts # HTML -> markdown (boilerplate removal)
│   │   │   ├── chunker.ts           # ~500 tokens/chunk, ~50 token overlap, heading-aware
│   │   │   ├── boilerplate-dedup.ts # Shingle-based (Jaccard 0.85) + content hash dedup
│   │   │   └── pdf-extractor.ts     # Gemini-based PDF extraction (50MB limit)
│   │   ├── queue/
│   │   │   ├── connection.ts        # Redis/ioredis connection (REDIS_URL parsing)
│   │   │   ├── crawl-queue.ts       # BullMQ queue ('crawl', keep 100/50)
│   │   │   └── worker.ts            # Job handler (incremental re-embedding, audit logging)
│   │   ├── security/
│   │   │   └── passcode-session.ts  # httpOnly secure cookie for passcode sessions
│   │   ├── rate-limiter.ts          # IP + session rate limiting
│   │   ├── usage-logger.ts          # Usage event + audit log recording
│   │   └── utils/
│   │       ├── slug.ts              # Slug generation
│   │       ├── url.ts               # URL validation and normalization
│   │       └── cn.ts                # Tailwind class merge utility
│   ├── hooks/
│   │   ├── use-chat.ts              # Streaming SSE, conversation tracking, abort control
│   │   └── use-agent.ts             # Agent CRUD operations hook
│   ├── types/
│   │   ├── index.ts                 # All TypeScript interfaces (30+ types)
│   │   └── chromium.d.ts            # Chromium module type declarations
│   └── i18n/
│       ├── config.ts                # Locales: ['en', 'ko'], default: 'en'
│       ├── request.ts               # Server-side locale validation + message loading
│       ├── routing.ts               # next-intl routing definition
│       └── navigation.ts            # Locale-aware Link, redirect, useRouter
├── workers/
│   ├── crawl-worker.ts              # BullMQ worker entry point (graceful shutdown)
│   ├── recrawl-scheduler.ts         # Polls recrawl_policies every 60s, triggers incremental crawls
│   └── nightly-eval.ts              # Runs eval datasets on schedule
└── scripts/
    └── setup-db.ts                  # Prints combined SQL from all migrations
```

---

## Key Implementation Details

### Web Crawler Strategy

```
For each URL to crawl:
  1. Check robots.txt (fetched + parsed via robots-parser library)
  2. Respect Crawl-Delay directive (default: 500ms between requests)
  3. Try HTTP fetch + cheerio parsing (with etag/If-Modified-Since for 304 handling)
  4. If content is minimal or JS-heavy -> retry with Puppeteer-core (headless Chromium)
  5. If content-type is PDF -> extract via Gemini 3.1 Flash Lite (base64, 50MB limit)
  6. Extract main content (remove nav, footer, scripts, styles, ads, sidebar)
  7. Convert HTML -> clean markdown with heading preservation
  8. Discover linked URLs on same domain (BFS approach)
  9. Parse sitemap.xml from robots.txt directives + common paths + nested sitemaps
  10. Track visited URLs to avoid duplicates (URL normalization + content hash)
  11. Filter boilerplate via shingle-based near-duplicate detection (Jaccard >= 0.85)
  12. Store page with etag/lastModified for future incremental crawls
```

### Text Chunking Strategy

```
  1. Split text by headings (## sections) first
  2. Split large sections by paragraphs
  3. Target chunk size: ~500 tokens (~2000 chars, 4 chars/token estimate)
  4. Overlap: ~50 tokens (~200 chars) between consecutive chunks
  5. Minimum chunk size: 50 characters
  6. Preserve metadata: heading_path, chunk_index, snippet, language, token_count
  7. Content hash computed per chunk (for incremental re-embedding)
```

### RAG Chat Pipeline

```
User Question
  -> Rate limit check (IP + session)
  -> Bot detection
  -> Validate agent access (public / passcode / share link token)
  -> Generate query embedding (gemini-embedding-001, 768 dims, RETRIEVAL_QUERY)
  -> Hybrid search in pgvector + tsvector (top 8, 0.7 semantic + 0.3 keyword weight)
  -> Build system prompt with security hardening (prompt injection prevention)
  -> Generate structured JSON response (gemini-3.1-flash-lite-preview)
     { answer, citations, confidence, answered_from_sources_only, needs_recrawl }
  -> If confidence < 0.4 -> auto-escalate to gemini-3.1-pro-preview
  -> Stream response to client via SSE
  -> Record usage event + store message with confidence + model_used
```

### Incremental Crawl & Re-embedding

```
On incremental crawl:
  1. Load existing pages with etag/lastModified
  2. Send conditional HTTP requests (If-None-Match / If-Modified-Since)
  3. Skip pages that return 304 Not Modified
  4. For changed pages, compare chunk content hashes
  5. Only re-embed new/changed chunks (skip unchanged)
  6. Store previous_markdown for content diff feature
  7. Record audit log entries for each crawl
```

### Gemini Models Used

| Purpose | Model | Notes |
|---------|-------|-------|
| Chat (default) | `gemini-3.1-flash-lite-preview` | Fast, cost-effective |
| Chat (escalation) | `gemini-3.1-pro-preview` | Higher quality when confidence < 0.4 |
| Embeddings | `gemini-embedding-001` | 768 dimensions, L2 normalized |
| PDF extraction | `gemini-3.1-flash-lite-preview` | Base64 input, markdown output |
| Live verification | `gemini-3.1-pro-preview` | With googleSearch + urlContext tools |
| Starter questions | `gemini-3.1-flash-lite-preview` | Generates 4 context-aware questions |

---

## API Endpoints (22 total)

### Core

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/health` | No | Health check with timestamp |
| GET | `/api/metrics` | Optional API key | Prometheus-compatible system metrics |

### Agents

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/agents` | Yes | List user's agents |
| POST | `/api/agents` | Yes | Create agent + start initial crawl |
| GET | `/api/agents/[id]` | Public | Agent details + stats |
| PATCH | `/api/agents/[id]` | Yes (owner) | Update name, description, visibility, passcode |
| DELETE | `/api/agents/[id]` | Yes (owner) | Delete agent and all related data |
| POST | `/api/agents/[id]/verify-passcode` | No | Verify passcode, set httpOnly cookie |
| GET/POST | `/api/agents/[id]/share-links` | Yes (owner) | List/create share links |
| DELETE | `/api/agents/[id]/share-links/[linkId]` | Yes (owner) | Revoke (soft delete) share link |
| GET | `/api/agents/[id]/pages` | Yes (owner) | Paginated crawled pages (max 100) |
| GET/POST/DELETE | `/api/agents/[id]/domains` | Yes (owner) | Manage allowed domains |
| GET | `/api/agents/[id]/analytics` | Yes (owner) | 30-day analytics via RPC |
| POST | `/api/agents/[id]/file-search` | Yes (owner) | Upload pages to Gemini Files API |
| POST | `/api/agents/[id]/generate-starters` | Yes (owner) | AI-generate starter questions |
| GET/PUT/DELETE | `/api/agents/[id]/recrawl-policy` | Yes (owner) | Manage scheduled recrawl (1-8760 hours) |
| GET/PUT/DELETE | `/api/agents/[id]/custom-domain` | Yes (owner) | Custom domain with DNS verification |
| GET | `/api/agents/[id]/diff` | Yes (owner) | Line-based content diff |
| GET/PUT/POST | `/api/agents/[id]/eval` | Yes (owner) | Eval dataset management + run evals |

### Crawl

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/crawl` | Yes | Start crawl (full/incremental/single_page) |
| GET | `/api/crawl/status?agent_id=` | No | Check crawl progress |

### Chat

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/chat` | Dynamic | Streaming SSE chat (visibility + share link + passcode checks) |

### Organizations

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET/POST | `/api/organizations` | Yes | List/create organizations |
| GET/POST/DELETE | `/api/organizations/[orgId]/members` | Yes (RBAC) | Member management |

### Webhooks

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/webhooks/crawler` | Bearer token | Worker callbacks (started/progress/completed/failed) |

---

## Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Gemini AI
GEMINI_API_KEY=your-gemini-api-key

# Redis (for BullMQ job queue)
REDIS_URL=redis://localhost:6379

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
PASSCODE_SESSION_SECRET=replace-with-a-long-random-secret

# Webhooks (for crawler status callbacks)
WEBHOOK_SECRET=your-webhook-secret

# Metrics (optional — protects /api/metrics endpoint)
METRICS_API_KEY=your-metrics-api-key

# Wildcard subdomain routing (optional)
# WILDCARD_DOMAIN=yourdomain.com
```

---

## Docker Setup

### Dockerfile (4-stage build)

1. **base** — Node 20 slim + Chromium + CJK fonts (for Puppeteer)
2. **deps** — Production dependencies only (`npm ci --omit=dev`)
3. **builder** — Full build with dev dependencies, accepts Supabase build args
4. **runner** — Production image: non-root user, standalone output, workers + lib copied

### docker-compose.yml (8 services)

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| db | supabase/postgres:15.6.1.143 | 5432 | PostgreSQL + pgvector, auto-runs migrations |
| redis | redis:7-alpine | 6379 | BullMQ job queue, persistent volume |
| auth | supabase/gotrue:v2.158.1 | 9999 | Authentication (JWT, email, auto-confirm) |
| rest | postgrest/postgrest:v12.2.3 | — | REST API layer |
| kong | kong:2.8.1 | 8000 | API gateway (CORS, key-auth, request-transformer) |
| studio | supabase/studio:latest | 3001 | Admin dashboard |
| meta | supabase/postgres-meta:v0.83.2 | — | Introspection for Studio |
| inbucket | inbucket/inbucket:3.0.3 | 9000 | Fake SMTP for local email testing |

---

## Running

```bash
# Infrastructure
docker compose up -d

# App
npm ci
npm run dev

# Crawl worker (required for crawling)
npm run worker

# Optional background jobs
npm run recrawl-scheduler
npm run nightly-eval

# Quality checks
npm run lint
npx tsc --noEmit
npm run build
```
