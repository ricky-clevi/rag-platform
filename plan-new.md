# Feature Roadmap: Making AgentForge RAG Platform World-Class (Revised v3)

## Context

AgentForge is a Next.js 16 RAG platform that lets users crawl websites and create AI chatbots per company. Stack: Next.js 16, React 19, TypeScript, Supabase (pgvector), Gemini API, BullMQ/Redis, shadcn/ui, Tailwind v4, next-intl (EN+KO).

Core pipeline (crawl -> embed -> store -> search -> chat) fully working across 5 sites.

## Existing Infrastructure (must not duplicate)

- recrawl_policies table + recrawl-scheduler.ts worker + /api/agents/[id]/recrawl-policy endpoints
- /api/crawl/preview endpoint backed by mapSiteUrls with SSRF guards
- nightly-eval.ts worker with per-agent eval datasets
- company-profiler.ts generates system_prompt, welcome_message, starter_questions (but does NOT persist company_profile JSONB)
- worker.ts:executeCrawlJob has access to previous_markdown vs clean_markdown per page
- SourceCitation type currently has: url, title, snippet, heading_path?, similarity? (no chunk_id)

## Phase 1: Contextual Embeddings + Change Detection (2-3 days)

### 1A. Contextual Embeddings

Implementation:

1. After crawling a page, generate page-level synopsis via Gemini Flash Lite (1 call per page, NOT per chunk):
   "Summarize this page in 2-3 sentences: what company, what section, what topics."

2. Store synopsis in pages.synopsis column (TEXT).

3. In worker.ts, prepend synopsis to each chunk before embedding:
   preprocessForEmbedding: "{synopsis}\n\n{heading_path}: {content}"

4. Store the full context used for embedding in chunks.context_prefix column.

5. Thread context_prefix end-to-end:
   - Migration 006: ADD pages.synopsis TEXT, chunks.context_prefix TEXT
   - Migration 006: CREATE OR REPLACE hybrid_search RPC to return context_prefix
   - src/types/index.ts: Add context_prefix?: string to MatchedChunk
   - src/lib/rag/reranker.ts: Include context_prefix in ranking prompt
   - src/app/api/chat/route.ts: Pass context_prefix alongside chunk content to LLM

Files: worker.ts, 006 migration, types/index.ts, reranker.ts, chat route.ts

### 1B. Change Detection (in executeCrawlJob, not scheduler)

Implementation:

1. In executeCrawlJob's onPageCrawled callback (where previous_markdown and clean_markdown are both available), after page upsert:
   - If previous_markdown exists and differs from clean_markdown:
     - Use Gemini Flash Lite to summarize what changed
     - Write to pages.change_summary JSONB: { changed_at, summary, diff_size }

2. Migration 006: ADD pages.change_summary JSONB

3. recrawl-scheduler.ts remains trigger-only (no modification needed).

4. Freshness indicator on agent cards: calculate from crawl_stats.completed_at.

Files: worker.ts (in onPageCrawled), 006 migration, agent-card.tsx

## Phase 2: LLM Content Cleaning + Crawl Path Filtering (2-3 days)

### 2A. LLM-Powered Content Cleaning

1. Add quality scoring to content-extractor.ts.
2. For poor extractions, send raw HTML to Gemini Flash Lite for clean markdown.
3. Track via pages.extraction_method column ('readability' | 'cheerio' | 'llm').

Files: content-extractor.ts, 006 migration

### 2B. Crawl Path Filtering (extending existing preview)

1. Update /api/crawl POST to accept and forward: include_paths, exclude_paths, max_depth, max_pages.
2. Update /api/crawl/preview response to include path prefix grouping.
3. Add crawl-preview.tsx UI component.

Files: /api/crawl/route.ts, /api/crawl/preview/route.ts, crawl-preview.tsx

## Phase 3: Structured Entity Extraction + Agentic RAG (3-5 days)

### 3A. Entity Extraction (pseudo-chunk approach for provenance)

Problem: Profile facts need to be citable in the same way chunks are, to maintain the source-grounding contract.

Implementation:

1. After crawl completes, run entity extraction on top pages. Schema:
   { company_name, industry, description, products[], team[], faqs[], contact{} }
   Each field includes source_page_id and source_url for provenance.

2. Convert extracted facts into pseudo-chunks:
   - Create chunk records with agent_id, page_id (source page), content (structured fact as text)
   - heading_path: "Extracted: Products" / "Extracted: Team" / "Extracted: FAQ"
   - These chunks participate in normal hybrid search and citation flow
   - They get embeddings like any other chunk

3. Additionally persist the full structured profile in agent_settings.company_profile JSONB:
   - Update applyCompanyProfile to also write: company_profile: profile (the full JSONB)
   - Used by UI to display products/team/FAQs natively on agent page

4. In chat route, no special injection needed - profile facts are already in the chunk index and will be retrieved via normal hybrid search. The citation pipeline (SourceCitation with chunk_id) handles provenance automatically.

5. Extend SourceCitation to include chunk_id for feedback attribution:
   - Add chunk_id?: string to SourceCitation type
   - When building sources in chat route, include chunk.id
   - This enables feedback -> chunk attribution for quality scoring (Phase 5)

6. New /api/agents/[id]/profile endpoint:
   - Reads company_profile from agent_settings
   - Enforces same visibility rules as chat (public/private/passcode checks)

Files: company-profiler.ts, worker.ts, types/index.ts (SourceCitation), chat route.ts, /api/agents/[id]/profile/route.ts

### 3B. Agentic RAG (Multi-Step Retrieval)

1. Query analysis: simple | comparison | multi_part with sub_queries.
2. Parallel hybrid_search per sub-query, merge, rerank.
3. Reflection loop (max 2 rounds).

Files: query-analyzer.ts (new), chat route.ts, reranker.ts

## Phase 4: Anti-Bot Stealth + Multi-Format Extraction (3-4 days)

### 4A. Stealth Crawling (opt-in via agent_settings.crawl_options)

1. Add agent_settings.crawl_options JSONB (migration 007):
   { stealth_mode: boolean, proxy_url?: string, enable_ocr?: boolean, max_images_ocr?: number }

2. Update AgentSettings type in src/types/index.ts to include crawl_options.

3. Create src/lib/crawler/stealth.ts: UA rotation, viewport randomization.

4. Conditional stealth in http-crawler.ts and browser-pool.ts (only when enabled).

5. Robots.txt compliance maintained even in stealth mode.

Files: stealth.ts (new), http-crawler.ts, browser-pool.ts, types/index.ts

### 4B. Multi-Format Extraction (opt-in, same-origin, with caps)

1. Image OCR: same-origin only, 5MB/image, 10 images/page, MIME validation, 30s timeout.
2. Complex tables: Gemini description, 2000 tokens/table, 5 tables/page.
3. YouTube transcripts: opt-in, max 3/page.

Files: content-extractor.ts, index.ts

## Phase 5: Find Similar + Chunk Quality Scoring (2-3 days)

### 5A. Find Similar Companies

1. Compute agent embedding (average of chunk embeddings).
2. Store in agents.embedding vector(768).
3. New RPC find_similar_agents with visibility enforcement.

### 5B. Chunk Quality Scoring (dedicated scorer job)

1. Add chunks.quality_score FLOAT DEFAULT 1.0 (migration 007).

2. Create dedicated workers/chunk-scorer.ts (NOT reusing nightly-eval):
   - Runs weekly or on-demand
   - Factors: information density, freshness decay, hit rate (from usage_events)
   - User feedback factor requires chunk_id in SourceCitation (added in Phase 3A step 5)
   - Tracks feedback by joining messages.sources[].chunk_id -> chunks.id

3. Update hybrid_search RPC to multiply quality_score into rank_weight.

Files: workers/chunk-scorer.ts (new), 007 migration, hybrid_search RPC update

## Migration Strategy (Forward-Only)

ALL schema changes in new forward migrations. Never edit 001-005.

Migration 006 (Phase 1+2):
- ALTER TABLE pages ADD COLUMN IF NOT EXISTS synopsis TEXT;
- ALTER TABLE pages ADD COLUMN IF NOT EXISTS change_summary JSONB;
- ALTER TABLE pages ADD COLUMN IF NOT EXISTS extraction_method TEXT DEFAULT 'readability';
- ALTER TABLE chunks ADD COLUMN IF NOT EXISTS context_prefix TEXT;
- CREATE OR REPLACE FUNCTION hybrid_search(...) - updated to return context_prefix;

Migration 007 (Phase 4+5):
- ALTER TABLE agent_settings ADD COLUMN IF NOT EXISTS crawl_options JSONB DEFAULT '{}';
- ALTER TABLE chunks ADD COLUMN IF NOT EXISTS quality_score FLOAT DEFAULT 1.0;
- ALTER TABLE agents ADD COLUMN IF NOT EXISTS embedding vector(768);
- CREATE OR REPLACE FUNCTION hybrid_search(...) - updated to use quality_score;

Docker-compose.yml updated to mount 006 and 007.

## Validation Strategy

Run nightly-eval harness before and after each phase on all 5 agents. Measure retrieval accuracy and answer quality empirically. Do NOT treat any parameter (chunk size, rerank depth, hybrid weighting) as frozen - validate with repo-specific eval data.

## Summary

| Phase | Features | Impact | Effort |
|-------|----------|--------|--------|
| 1 | Contextual embeddings + Change detection | Highest | 2-3 days |
| 2 | LLM content cleaning + Path filtering | High | 2-3 days |
| 3 | Entity extraction (pseudo-chunks) + Agentic RAG | High | 3-5 days |
| 4 | Stealth crawling + Multi-format | Medium | 3-4 days |
| 5 | Find similar + Quality scoring | Medium | 2-3 days |
