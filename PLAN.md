# RAG Agent Builder Platform — Implementation Plan

## Overview

A full-stack platform where users input a company's website URL, the system crawls all accessible pages, stores the content as vector embeddings, and creates a dedicated AI chatbot agent for that company. Each agent is shareable via a unique URL path and can answer questions about the company using RAG (Retrieval-Augmented Generation).

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) + TypeScript |
| UI | shadcn/ui + Tailwind CSS v4 |
| Database | Supabase (PostgreSQL) |
| Vector DB | Supabase pgvector extension (3072 dimensions) |
| Auth | Supabase Auth (email/password + OAuth) |
| LLM | Gemini 3 Flash (`gemini-3-flash-preview`) via `@google/genai` |
| Embeddings | Gemini Embedding (`gemini-embedding-001`, 3072 dims) |
| Web Crawling | Hybrid: HTTP (cheerio) + headless browser (Puppeteer) fallback |
| i18n | next-intl (English + Korean) |
| Deployment | Docker (self-hosted) |
| Queue/Jobs | BullMQ + Redis (for background crawl jobs) |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Next.js App (Frontend)                │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐            │
│  │ Dashboard │  │  Agent   │  │   Chat    │            │
│  │  (Auth)   │  │ Builder  │  │ Interface │            │
│  └──────────┘  └──────────┘  └───────────┘            │
├─────────────────────────────────────────────────────────┤
│                  Next.js API Routes                     │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐            │
│  │ /api/     │  │ /api/    │  │ /api/     │            │
│  │ crawl     │  │ agents   │  │ chat      │            │
│  └──────────┘  └──────────┘  └───────────┘            │
├─────────────────────────────────────────────────────────┤
│                  Background Services                    │
│  ┌──────────────────────────────────────────┐          │
│  │  BullMQ Worker (Crawl + Embed Pipeline)  │          │
│  │  1. Fetch pages (HTTP → Puppeteer)       │          │
│  │  2. Extract & clean text                 │          │
│  │  3. Chunk text                           │          │
│  │  4. Generate embeddings (Gemini)         │          │
│  │  5. Store in Supabase pgvector           │          │
│  └──────────────────────────────────────────┘          │
├─────────────────────────────────────────────────────────┤
│                    Data Layer                           │
│  ┌──────────┐  ┌──────────────┐  ┌────────┐          │
│  │ Supabase │  │  pgvector     │  │ Redis  │          │
│  │ Postgres │  │  (embeddings) │  │ (jobs) │          │
│  └──────────┘  └──────────────┘  └────────┘          │
└─────────────────────────────────────────────────────────┘
```

---

## Database Schema

### Tables

```sql
-- Users (managed by Supabase Auth, extended with profiles)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agents (one per crawled company)
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  website_url TEXT NOT NULL,
  logo_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'crawling', 'processing', 'ready', 'error')),
  is_public BOOLEAN DEFAULT true,
  crawl_stats JSONB DEFAULT '{}',
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Crawled pages
CREATE TABLE pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT,
  content TEXT,
  metadata JSONB DEFAULT '{}',
  crawled_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_id, url)
);

-- Document chunks with embeddings
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  page_id UUID REFERENCES pages(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  embedding VECTOR(3072),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat conversations
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  title TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat messages
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  sources JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_agents_user_id ON agents(user_id);
CREATE INDEX idx_agents_slug ON agents(slug);
CREATE INDEX idx_pages_agent_id ON pages(agent_id);
CREATE INDEX idx_documents_agent_id ON documents(agent_id);
CREATE INDEX idx_conversations_agent_id ON conversations(agent_id);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);

-- Vector similarity search index (HNSW for better accuracy)
CREATE INDEX idx_documents_embedding ON documents
  USING hnsw (embedding vector_cosine_ops);

-- RPC function for similarity search
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding VECTOR(3072),
  match_agent_id UUID,
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.content,
    d.metadata,
    1 - (d.embedding <=> query_embedding) AS similarity
  FROM documents d
  WHERE d.agent_id = match_agent_id
    AND 1 - (d.embedding <=> query_embedding) > match_threshold
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

---

## Directory Structure

```
/home/user/rag-platform/
├── .env.local.example
├── .env.local
├── Dockerfile
├── docker-compose.yml
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
├── messages/
│   ├── en.json                    # English translations
│   └── ko.json                    # Korean translations
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql
├── src/
│   ├── app/
│   │   ├── [locale]/
│   │   │   ├── layout.tsx         # Root layout with i18n
│   │   │   ├── page.tsx           # Landing page
│   │   │   ├── (auth)/
│   │   │   │   ├── login/page.tsx
│   │   │   │   └── signup/page.tsx
│   │   │   ├── (dashboard)/
│   │   │   │   ├── layout.tsx     # Dashboard layout (auth protected)
│   │   │   │   ├── dashboard/page.tsx
│   │   │   │   └── agents/
│   │   │   │       ├── page.tsx        # List agents
│   │   │   │       ├── new/page.tsx    # Create new agent (URL input)
│   │   │   │       └── [id]/
│   │   │   │           ├── page.tsx    # Agent detail/settings
│   │   │   │           └── analytics/page.tsx
│   │   │   └── agent/
│   │   │       └── [slug]/
│   │   │           └── page.tsx   # Public chat interface
│   │   └── api/
│   │       ├── agents/
│   │       │   ├── route.ts       # CRUD agents
│   │       │   └── [id]/
│   │       │       └── route.ts
│   │       ├── crawl/
│   │       │   ├── route.ts       # Start crawl job
│   │       │   └── status/[jobId]/route.ts
│   │       └── chat/
│   │           └── route.ts       # Chat endpoint (streaming)
│   ├── components/
│   │   ├── ui/                    # shadcn/ui components
│   │   ├── layout/
│   │   │   ├── header.tsx
│   │   │   ├── sidebar.tsx
│   │   │   └── footer.tsx
│   │   ├── agent/
│   │   │   ├── url-input.tsx      # URL input field (browser-like)
│   │   │   ├── agent-card.tsx
│   │   │   ├── agent-status.tsx
│   │   │   └── crawl-progress.tsx
│   │   ├── chat/
│   │   │   ├── chat-interface.tsx
│   │   │   ├── message-bubble.tsx
│   │   │   ├── chat-input.tsx
│   │   │   └── source-citation.tsx
│   │   └── common/
│   │       ├── language-switcher.tsx
│   │       └── loading-states.tsx
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts          # Browser client
│   │   │   ├── server.ts          # Server client
│   │   │   └── middleware.ts      # Auth middleware
│   │   ├── gemini/
│   │   │   ├── client.ts          # Gemini SDK setup
│   │   │   ├── embeddings.ts      # Embedding generation
│   │   │   └── chat.ts            # Chat completion with RAG
│   │   ├── crawler/
│   │   │   ├── index.ts           # Main crawler orchestrator
│   │   │   ├── http-crawler.ts    # HTTP-based crawler (cheerio)
│   │   │   ├── browser-crawler.ts # Puppeteer-based crawler
│   │   │   ├── content-extractor.ts # HTML → clean text
│   │   │   └── chunker.ts         # Text chunking
│   │   ├── queue/
│   │   │   ├── connection.ts      # Redis/BullMQ connection
│   │   │   ├── crawl-queue.ts     # Crawl job queue
│   │   │   └── worker.ts          # Background worker
│   │   └── utils/
│   │       ├── slug.ts
│   │       └── url.ts
│   ├── hooks/
│   │   ├── use-chat.ts
│   │   └── use-agent.ts
│   ├── types/
│   │   └── index.ts
│   └── i18n/
│       ├── config.ts
│       └── request.ts
├── workers/
│   └── crawl-worker.ts           # Standalone worker process
└── scripts/
    └── setup-db.ts               # Database setup script
```

---

## Implementation Phases

### Phase 1: Project Setup & Foundation
1. Initialize Next.js 15 project with TypeScript
2. Set up Tailwind CSS v4 + shadcn/ui
3. Configure Supabase client (auth + database)
4. Set up next-intl for i18n (English + Korean)
5. Create base layout, header, footer, language switcher
6. Set up Docker + docker-compose (app + Redis)

### Phase 2: Authentication & User Management
1. Supabase Auth setup (email/password)
2. Login / Signup pages
3. Auth middleware for protected routes
4. User profile table + trigger
5. Dashboard layout with sidebar

### Phase 3: Database & Vector Store
1. Create Supabase migration with full schema
2. Enable pgvector extension
3. Create similarity search RPC function
4. Set up database types generation

### Phase 4: Web Crawler Engine
1. HTTP crawler with cheerio (fast path)
2. Puppeteer browser crawler (fallback for JS-heavy sites)
3. Content extractor (HTML → clean text, remove nav/footer/ads)
4. Text chunker (semantic chunking with overlap)
5. URL discovery and deduplication
6. Crawl orchestrator (manages the full pipeline)
7. BullMQ queue + Redis for background processing
8. Worker process for handling crawl jobs

### Phase 5: Gemini Integration (Embeddings + RAG)
1. Set up `@google/genai` SDK
2. Embedding generation pipeline (batch processing)
3. Store embeddings in pgvector
4. Similarity search implementation
5. RAG chat pipeline (query → embed → search → augment → generate)
6. Streaming chat responses

### Phase 6: Agent Builder UI
1. URL input component (browser-style address bar)
2. Agent creation flow (URL → crawl → build → ready)
3. Real-time crawl progress tracking
4. Agent list/grid view on dashboard
5. Agent detail/settings page

### Phase 7: Public Chat Interface
1. Chat UI for public agent pages (`/agent/[slug]`)
2. Message history within session
3. Source citations with links
4. Responsive design (mobile-friendly)
5. Share functionality

### Phase 8: i18n & Polish
1. Complete English translations
2. Complete Korean translations
3. Language switcher in header
4. RTL-safe layout considerations
5. Loading states, error states, empty states

### Phase 9: Docker & Deployment
1. Multi-stage Dockerfile
2. docker-compose.yml (app + Redis + worker)
3. Environment variable documentation
4. Health check endpoints
5. Production optimizations

---

## Key Implementation Details

### Web Crawler Strategy

```
For each URL to crawl:
  1. Try HTTP fetch (axios/fetch) + cheerio parsing
  2. If content is minimal (< 100 chars of text) → retry with Puppeteer
  3. Extract main content (remove headers, footers, nav, scripts, styles)
  4. Discover linked URLs on same domain
  5. Add new URLs to crawl queue (BFS approach)
  6. Track visited URLs to avoid duplicates
  7. Respect robots.txt
  8. Rate limit requests (polite crawling)
```

### Text Chunking Strategy

```
  1. Split text by paragraphs/sections
  2. Target chunk size: ~500 tokens
  3. Overlap: ~50 tokens between chunks
  4. Preserve metadata: source URL, page title, section heading
```

### RAG Chat Pipeline

```
User Question
  → Generate embedding (gemini-embedding-001)
  → Similarity search in pgvector (top 5 matches)
  → Construct prompt with context
  → Generate response (gemini-3-flash-preview)
  → Stream response to client
  → Include source citations
```

### Gemini Models Used

| Purpose | Model | Notes |
|---------|-------|-------|
| Chat/Generation | `gemini-3-flash-preview` | Fast, cost-effective, Pro-level quality |
| Embeddings | `gemini-embedding-001` | 3072 dimensions, 100+ languages |

---

## Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Gemini
GEMINI_API_KEY=

# Redis (for BullMQ)
REDIS_URL=redis://localhost:6379

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```
