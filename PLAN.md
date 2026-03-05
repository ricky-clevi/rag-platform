# AgentForge RAG Platform — Upgrade Plan

## Problem Diagnosis: Why It Doesn't Feel "Cool" Yet

After a deep code audit, here are the real issues holding this platform back:

### Crawler: Looks Good on Paper, Broken in Practice
1. **New browser per page** — `browser-crawler.ts` launches a fresh Chromium instance for every single fallback page. On a 200-page site this means 200 cold Chromium starts. Catastrophically slow.
2. **Sequential crawling** — Pages are fetched one-by-one in a BFS loop with a 500ms delay each. A 500-page site takes 4+ minutes minimum just for HTTP fetching, plus embedding time.
3. **Sitemap discovery aborts early** — `discoverSitemapUrls` has `if (urls.length > 0) break;` (line 149) — stops after the first sitemap that returns anything, missing all others.
4. **SPA/JS sites get garbage** — Browser fallback just waits 2 seconds after `networkidle2`. No scroll, no click, no cookie banner dismissal, no lazy-load triggers.
5. **Content extraction is primitive** — Strips ALL `<nav>`, `<header>`, `<footer>` elements blindly. Many company sites put critical info (phone, address, service links) in these areas. Only extracts `h1-h6, p, li, td, th, blockquote` — misses `<div>` text, `<span>`, `<dl>`, etc.
6. **Boilerplate filter too aggressive** — Anything under 30 chars is killed. This removes legitimate short content like product names, pricing tiers, feature bullets.
7. **No structured data extraction** — Ignores JSON-LD, Schema.org, OpenGraph metadata. These contain the richest company information (org name, address, phone, products, reviews).
8. **Crawlee and Playwright installed but unused** — Dead weight in package.json (crawlee@3.16, playwright-core@1.58).

### Embedding Pipeline: Slow & Fragile
9. **One API call per chunk** — Worker generates embeddings one-at-a-time (line 180 of worker.ts). A 500-chunk crawl = 500 sequential Gemini API calls.
10. **`generateEmbeddingsBatch` is fake batching** — Calls `generateEmbedding()` individually inside `Promise.allSettled`. Not using Gemini's actual batch embedding API.
11. **Zero vectors on failure** — Failed embeddings get `new Array(768).fill(0)` as placeholder. These zero vectors will match everything with high similarity, corrupting search results.

### RAG Chat: Simulated Streaming, No Intelligence
12. **Fake streaming** — The chat route generates the FULL response, then chops it into 20-character slices (line 268). The user sees "streaming" but waits the full generation time upfront.
13. **No query reformulation** — User's raw question goes straight to embedding search. "What does your company do?" searches for that literal text instead of being expanded to related terms.
14. **No re-ranking** — Top 8 chunks by raw vector similarity are passed directly. No cross-encoder or relevance re-ranking to filter out noise.
15. **Fixed retrieval count** — Always retrieves exactly 8 chunks regardless of query complexity.
16. **Conversation history will blow up** — Last 10 messages sent raw. Long conversations will exceed context window with no summarization.

### UX: Functional But Not Impressive
17. **Polling-based updates** — Crawl progress uses 2-second polling instead of real-time SSE/WebSocket.
18. **No crawl preview** — User enters URL and hopes for the best. No preview of discovered pages, no sitemap preview, no estimated time.
19. **No agent knowledge browser** — Can't browse what the agent knows before chatting with it.
20. **Generic landing page** — No live demo, no interactive example, no wow factor.

---

## The Plan: Make It Actually Great

### Phase 1: Fix the Crawler (Make It Actually Crawl Well)

#### 1.1 Replace Browser Crawling Architecture
**Problem:** New Chromium instance per page.
**Solution:** Use a persistent browser pool.

```
Changes:
- src/lib/crawler/browser-crawler.ts — REWRITE
  - Create a BrowserPool class that maintains 3-5 persistent Chromium instances
  - Reuse browser contexts, create new pages (tabs) per URL
  - Add smart waiting: wait for network idle + MutationObserver silence
  - Add cookie banner auto-dismissal (click common consent buttons)
  - Add scroll-to-bottom for lazy-loaded content
  - Add screenshot capture for visual verification (optional, stored in crawl_stats)
  - Close pages after extraction, not browsers

- Remove dependencies: crawlee, playwright-core (unused)
```

#### 1.2 Parallel Page Fetching
**Problem:** Sequential one-page-at-a-time crawling.
**Solution:** Concurrent fetching with configurable parallelism.

```
Changes:
- src/lib/crawler/index.ts — MAJOR REFACTOR
  - Replace single-threaded BFS with a concurrent work pool (p-limit or custom semaphore)
  - Default concurrency: 5 HTTP requests, 2 browser pages simultaneously
  - Priority queue: prioritize pages closer to root (BFS level), sitemapped pages first
  - Respect per-domain rate limits from robots.txt Crawl-Delay
  - Fix sitemap discovery: remove the `break` on line 149, collect ALL sitemap URLs
  - Add progress estimation: (crawled / (crawled + queue_size)) percentage
  - Add ETA calculation based on rolling average page time
```

#### 1.3 Better Content Extraction
**Problem:** Primitive HTML-to-text that misses critical content.
**Solution:** Intelligent, context-aware extraction.

```
Changes:
- src/lib/crawler/content-extractor.ts — REWRITE
  - Use Readability algorithm (like Mozilla's) for main content detection instead of hardcoded selectors
  - Install and use @mozilla/readability for article extraction
  - Keep structured data: extract JSON-LD, Schema.org, OpenGraph into separate metadata
  - Extract company-critical elements: phone numbers, email addresses, physical addresses
  - Preserve tables as markdown tables (not just td/th text)
  - Preserve lists with proper markdown formatting
  - Extract image alt text (useful context)
  - Preserve link text with URLs for reference ("Contact Us [/contact]")
  - Don't blindly remove nav/header/footer — extract their links for URL discovery but also capture contact info
  - Language detection: use content analysis, not just <html lang>

- src/lib/crawler/structured-data.ts — NEW FILE
  - Parse JSON-LD from <script type="application/ld+json">
  - Extract Schema.org Organization, Product, FAQ, BreadcrumbList, etc.
  - Parse OpenGraph: og:title, og:description, og:image, og:type
  - Parse Twitter Card metadata
  - Store as structured metadata alongside page content
  - This data gets special treatment in chunking (high rank_weight)
```

#### 1.4 Smarter Chunking
**Problem:** Chunks don't preserve semantic meaning well enough.
**Solution:** Semantic-aware chunking with metadata enrichment.

```
Changes:
- src/lib/crawler/chunker.ts — ENHANCE
  - Add heading hierarchy tracking (not just ##, but h1 > h2 > h3 breadcrumb path)
  - Prefix each chunk with its source context: "[Page: About Us > Our Team > Leadership]\n"
  - Increase min chunk size to 80 chars (30 is too aggressive)
  - Add semantic boundary detection: don't split mid-sentence, mid-paragraph
  - Create special "summary chunks" from meta descriptions + structured data (rank_weight: 1.5)
  - Add FAQ detection: if page has FAQ schema or Q&A pattern, create one chunk per Q&A pair
  - Reduce overlap to 30 tokens but include the previous heading as overlap context

- src/lib/crawler/boilerplate-dedup.ts — FIX
  - Increase min content length from 30 to 80 chars
  - Don't filter based on content length alone — check against known boilerplate patterns only
  - Add domain-specific boilerplate detection: compare chunks across pages AFTER full crawl
  - Move the batch dedup to the worker (post-crawl pass) instead of per-page
```

#### 1.5 Handle Modern Web Patterns
**Problem:** SPAs, infinite scroll, dynamic content not handled.
**Solution:** Smart rendering strategies.

```
Changes:
- src/lib/crawler/index.ts — ADD SPA detection
  - Before crawling, check if root page has <div id="root">, <div id="app">, or similar SPA markers
  - If detected, automatically route ALL pages through browser crawler (not just fallback)
  - Add request interception to block images, fonts, analytics (speed up browser crawling)

- src/lib/crawler/browser-crawler.ts — ADD dynamic content handling
  - Scroll page to bottom in increments (trigger lazy loading)
  - Wait for content stability (MutationObserver with 1s silence threshold)
  - Click "Load More" / "Show All" buttons if detected
  - Handle infinite scroll: scroll until no new content appears (max 10 scrolls)
  - Dismiss cookie banners: click buttons matching [accept, agree, consent, OK, got it]
```

---

### Phase 2: Fix the Embedding Pipeline (Make It Fast & Reliable)

#### 2.1 True Batch Embedding
**Problem:** 500 sequential API calls for 500 chunks.
**Solution:** Use Gemini's batch embedding and parallel processing.

```
Changes:
- src/lib/gemini/embeddings.ts — REWRITE batch logic
  - Use Gemini batchEmbedContents API (embeds up to 100 texts in one call)
  - Process chunks in batches of 100 with 3 concurrent batch requests
  - A 500-chunk crawl: 5 API calls (3 concurrent) instead of 500 sequential calls
  - On individual item failure within a batch: retry that specific item, don't zero-fill
  - Add embedding cache: store content_hash -> embedding mapping to avoid re-embedding identical content across agents

- src/lib/queue/worker.ts — BATCH inserts
  - Collect all chunks for a page, embed them in one batch call
  - Use Supabase batch insert (one INSERT with array of rows) instead of per-chunk INSERT
  - Estimated speedup: 50-100x for embedding, 10x for database writes
```

#### 2.2 Embedding Quality Improvements
```
Changes:
- src/lib/gemini/embeddings.ts
  - Add task type differentiation: RETRIEVAL_DOCUMENT for chunks, RETRIEVAL_QUERY for queries
  - Already doing this correctly (confirmed in code)
  - Add content preprocessing: strip markdown formatting before embedding for cleaner vectors
  - Add chunk context injection: prepend "Company: {agent_name}. Page: {page_title}." to each chunk before embedding for better context

- Database migration (004_embedding_improvements.sql)
  - Add index on chunks(content_hash) for dedup lookups
  - Add index on chunks(agent_id, content_hash) for per-agent dedup
```

---

### Phase 3: Fix the RAG Chat (Make It Actually Smart)

#### 3.1 Real Streaming
**Problem:** Generates full response, then fake-streams it.
**Solution:** True streaming with structured post-processing.

```
Changes:
- src/app/api/chat/route.ts — REWRITE streaming logic
  - Primary path: Use streamChatResponse() for real token-by-token streaming
  - After stream completes: run a fast structured analysis (confidence, sources) as a separate non-streamed call
  - Send text chunks as they arrive, then send metadata (sources, confidence) at the end
  - This gives users instant first-token response instead of waiting 3-5 seconds

- src/lib/gemini/chat.ts
  - Modify streamChatResponse to include inline source references [1], [2] in the stream
  - Add post-stream metadata extraction: parse inline references to build citations
```

#### 3.2 Query Enhancement
**Problem:** Raw user query goes directly to vector search.
**Solution:** Query expansion and reformulation.

```
Changes:
- src/lib/rag/query-enhancer.ts — NEW FILE
  - Use Gemini Flash to reformulate user queries before search
  - Expand query: "What do you do?" → "company services products offerings main business"
  - Generate 2-3 query variations for multi-vector search
  - Extract key terms for better keyword (tsvector) matching
  - Detect query intent: factual, opinion, comparison, navigation
  - Handle follow-up questions: resolve pronouns using conversation context
    ("Tell me more about that" → "Tell me more about {previous topic}")

- src/app/api/chat/route.ts
  - Add query enhancement step between user message and embedding generation
  - Search with multiple query variations, merge and deduplicate results
```

#### 3.3 Result Re-ranking
**Problem:** Raw vector similarity doesn't always pick the best chunks.
**Solution:** Cross-encoder style re-ranking using Gemini.

```
Changes:
- src/lib/rag/reranker.ts — NEW FILE
  - Retrieve top 15 chunks (instead of 8)
  - Use Gemini Flash to score each chunk's relevance to the query (0-10)
  - Re-rank and take top 6 best-scoring chunks
  - This is a single Gemini call with all 15 chunks in context
  - Cost: ~1 additional API call per chat message, but dramatically better accuracy

- Alternatively: Use Gemini's built-in ranking:
  - Retrieve top 20 from hybrid_search
  - Score with a lightweight prompt: "Rate relevance 0-10: Query: {q}, Passage: {p}"
  - Take top 6
```

#### 3.4 Conversation Memory
**Problem:** Last 10 messages sent raw, will overflow on long conversations.
**Solution:** Sliding window with summarization.

```
Changes:
- src/lib/rag/conversation-memory.ts — NEW FILE
  - Keep last 4 messages as-is (recent context)
  - For messages 5-10: generate a concise summary using Gemini Flash
  - For messages 11+: discard (already summarized in the rolling summary)
  - Store summary in conversation record (add summary column to conversations table)
  - Include summary as context in system prompt: "Previous conversation summary: ..."
```

---

### Phase 4: Real-Time UX (Make It Feel Alive)

#### 4.1 SSE-Based Crawl Progress
**Problem:** 2-second polling is janky and resource-wasteful.
**Solution:** Server-Sent Events for real-time crawl updates.

```
Changes:
- src/app/api/crawl/stream/route.ts — NEW FILE
  - SSE endpoint: GET /api/crawl/stream?agent_id=xxx
  - Worker publishes progress to Redis pub/sub channel: `crawl:${agent_id}`
  - SSE route subscribes to channel and forwards events to client
  - Events: page_crawled, page_skipped, page_failed, progress_update, completed, error
  - Include: current URL, pages crawled, pages remaining, ETA, current page title

- src/lib/queue/worker.ts — ADD Redis pub/sub publishing
  - After each page: publish to Redis channel with progress data
  - Include: { type, url, title, crawled_count, total_discovered, eta_seconds }

- src/components/agent/crawl-progress.tsx — REWRITE
  - Replace polling with EventSource (SSE)
  - Show live feed: currently crawling URL, page titles as they're discovered
  - Show real progress bar with ETA
  - Show live stats: pages crawled, chunks created, errors
  - Add cancel button (publishes cancel to Redis, worker checks between pages)
```

#### 4.2 Agent Knowledge Browser
**Problem:** Users can't see what the agent knows.
**Solution:** Browsable knowledge base UI.

```
Changes:
- src/app/[locale]/(dashboard)/agents/[id]/knowledge/page.tsx — NEW FILE
  - Tree view of crawled pages organized by URL path hierarchy
  - Click a page to see its extracted content + chunks
  - Search across all agent knowledge (uses existing hybrid_search)
  - Show chunk count, language, last crawled date per page
  - Highlight pages with errors or low content
  - "Re-crawl this page" button for single-page refreshes

- src/app/api/agents/[id]/knowledge/route.ts — NEW FILE
  - GET: Return page tree with chunk counts
  - GET ?search=query: Search across agent's knowledge base
```

#### 4.3 Crawl Preview Before Starting
**Problem:** Users blindly enter a URL and hope for the best.
**Solution:** Pre-crawl analysis and confirmation.

```
Changes:
- src/app/api/crawl/preview/route.ts — NEW FILE
  - POST { url } → Quick analysis (5 seconds max):
    - Fetch robots.txt (check if crawling allowed)
    - Fetch sitemap.xml (count discoverable pages)
    - Fetch homepage (detect SPA, language, framework)
    - Extract company name from meta tags
    - Return: { company_name, estimated_pages, is_spa, languages, has_sitemap, crawl_allowed, estimated_time }

- src/app/[locale]/(dashboard)/agents/new/page.tsx — ENHANCE
  - After URL input, show preview card before starting crawl:
    "Found: Acme Corp | ~245 pages | Sitemap: Yes | Est. time: 3 min"
  - Let user confirm or adjust settings before crawling
  - Add advanced options: max pages, include/exclude URL patterns, allowed subdomains
```

---

### Phase 5: Agent Quality (Make the Agents Smart)

#### 5.1 Auto-Generated System Prompts
**Problem:** Generic system prompt doesn't capture company identity.
**Solution:** AI-generated company profile from crawled data.

```
Changes:
- src/lib/rag/company-profiler.ts — NEW FILE
  - After crawl completes, analyze top content to generate:
    - Company name, industry, key products/services
    - Tone and voice guide (formal, casual, technical)
    - Key topics the agent can answer about
    - Custom system prompt tailored to the company
  - Use Gemini to synthesize: "Based on this website content, describe this company..."
  - Store as auto-generated system_prompt in agent_settings
  - User can edit/override but gets a great default

- src/lib/queue/worker.ts — ADD post-crawl profiling
  - After crawl completes, run company profiler
  - Auto-generate starter questions (already exists, but trigger automatically)
  - Auto-set agent name from company name if user didn't provide one
```

#### 5.2 Source-Grounded Responses with Inline Citations
**Problem:** Citations are an afterthought — generated separately from the answer.
**Solution:** Inline source references in the response.

```
Changes:
- src/lib/gemini/chat.ts — ENHANCE system prompt
  - Instruct model to use inline citations: "According to [Source 1]..."
  - Map source numbers to actual page URLs in post-processing
  - Add citation verification: check that cited source actually contains the claimed info

- src/components/chat/message-bubble.tsx — ENHANCE
  - Parse inline [Source N] references and render as clickable badges
  - On click: scroll to source in citation drawer
  - Highlight the relevant excerpt in the source

- src/components/chat/citation-drawer.tsx — ENHANCE
  - Show full source page context (not just snippet)
  - Link to original page URL
  - Show which parts of the response cite this source
```

#### 5.3 Answer Quality Scoring & Feedback
```
Changes:
- src/components/chat/message-bubble.tsx — ADD feedback
  - Thumbs up/down buttons on assistant messages
  - Feedback stored in messages table (add feedback column)
  - Low-confidence answers shown with a subtle warning

- Database migration
  - ALTER TABLE messages ADD COLUMN feedback TEXT CHECK (feedback IN ('positive', 'negative', NULL));
  - ALTER TABLE messages ADD COLUMN feedback_text TEXT;
```

---

### Phase 6: Production Polish

#### 6.1 Error Recovery & Resilience
```
Changes:
- src/lib/crawler/index.ts
  - Add checkpoint/resume: save crawl state to Redis every 10 pages
  - On worker crash/restart: resume from last checkpoint instead of starting over
  - Add circuit breaker: if 10 consecutive pages fail, pause and alert

- src/lib/queue/worker.ts
  - Add dead letter queue for permanently failed jobs
  - Add job timeout: kill crawl after 30 minutes (configurable)
  - Add memory monitoring: abort if process exceeds 2GB
```

#### 6.2 Performance Caching
```
Changes:
- src/app/api/chat/route.ts
  - Add response cache: hash(agent_id + query + top_chunk_ids) → cached response
  - Cache TTL: 1 hour (invalidated on recrawl)
  - Serve cached responses in <100ms instead of 3-5 seconds

- src/lib/rag/cache.ts — NEW FILE
  - Redis-based cache for:
    - Query embeddings (avoid re-embedding identical questions)
    - Chat responses (for identical queries against same data)
    - Hybrid search results (for repeated queries)
  - Cache key: SHA256(agent_id + normalized_query)
  - Invalidation: on crawl complete, clear agent's cache
```

#### 6.3 Clean Up Dead Dependencies
```
Changes:
- package.json
  - Remove: crawlee (installed, never used)
  - Remove: playwright-core (installed, never used)
  - Add: @mozilla/readability (for content extraction)
  - Add: p-limit (for concurrency control)
```

---

## Implementation Priority Order

### Sprint 1: Crawler That Actually Works (3-4 days)
1. Fix sitemap discovery (remove `break`) — 30 min
2. Rewrite browser-crawler with persistent pool — 4 hours
3. Add concurrent page fetching — 3 hours
4. Improve content extraction with Readability — 4 hours
5. Add structured data extraction — 3 hours
6. Fix boilerplate filter thresholds — 1 hour
7. Remove unused dependencies — 30 min

### Sprint 2: Fast Embedding Pipeline (1-2 days)
1. Implement true batch embedding with batchEmbedContents — 3 hours
2. Batch Supabase inserts — 2 hours
3. Remove zero-vector fallback, add proper retry — 1 hour
4. Add embedding context injection — 1 hour

### Sprint 3: Smart RAG Chat (2-3 days)
1. Real streaming (use streamChatResponse as primary) — 3 hours
2. Query enhancement/reformulation — 4 hours
3. Result re-ranking — 3 hours
4. Conversation memory with summarization — 3 hours
5. Inline citations — 2 hours

### Sprint 4: Real-Time UX (1-2 days)
1. SSE-based crawl progress — 4 hours
2. Crawl preview endpoint — 2 hours
3. Enhanced new agent page with preview — 2 hours

### Sprint 5: Agent Intelligence (1-2 days)
1. Auto-generated company profile & system prompt — 3 hours
2. Knowledge browser page — 4 hours
3. Answer feedback (thumbs up/down) — 2 hours

### Sprint 6: Production Polish (1-2 days)
1. Response caching — 3 hours
2. Crawl checkpointing — 3 hours
3. Error recovery improvements — 2 hours

---

## Expected Impact

| Metric | Before | After |
|--------|--------|-------|
| Crawl speed (500 pages) | ~15-20 min | ~3-5 min |
| Embedding time (500 chunks) | ~8-10 min | ~30 sec |
| Time to first chat token | 3-5 sec | <1 sec |
| Content extraction quality | ~60% | ~90% |
| Answer accuracy (with re-ranking) | ~70% | ~85-90% |
| Structured data captured | 0% | 90%+ |
| User experience rating | Functional | Impressive |

---

## Architecture After Upgrade

```
+-----------------------------------------------------------+
|                  Next.js 16 App (Frontend)                 |
|  +----------+  +----------+  +-----------+  +-----------+ |
|  | Landing  |  | Dashboard|  |  Crawl    |  |   Chat    | |
|  |  (demo)  |  |  (Auth)  |  |  Preview  |  | (stream)  | |
|  +----------+  +----------+  +-----------+  +-----------+ |
|  +----------+  +----------+  +-----------+                |
|  | Knowledge|  | Analytics|  | Agent     |                |
|  | Browser  |  |          |  | Settings  |                |
|  +----------+  +----------+  +-----------+                |
+-----------------------------------------------------------+
|                  API Layer (SSE + REST)                     |
|  +----------+  +----------+  +-----------+  +-----------+ |
|  | /api/    |  | /api/    |  | /api/     |  | /api/     | |
|  | agents   |  | crawl    |  | chat      |  | crawl/    | |
|  |          |  | preview  |  | (stream)  |  | stream    | |
|  +----------+  +----------+  +-----------+  +-----------+ |
+-----------------------------------------------------------+
|                  Intelligence Layer                        |
|  +------------------+  +------------------+               |
|  | Query Enhancer   |  | Result Re-ranker |               |
|  | (reformulation)  |  | (Gemini Flash)   |               |
|  +------------------+  +------------------+               |
|  +------------------+  +------------------+               |
|  | Company Profiler |  | Conv. Memory     |               |
|  | (auto system     |  | (summarization)  |               |
|  |  prompt)         |  |                  |               |
|  +------------------+  +------------------+               |
+-----------------------------------------------------------+
|                  Crawler Engine                            |
|  +----------------------------------------------------+  |
|  | Concurrent Fetcher (5 HTTP + 2 Browser parallel)    |  |
|  | Browser Pool (3 persistent Chromium instances)      |  |
|  | Readability Extractor + Structured Data Parser      |  |
|  | Semantic Chunker + FAQ Detector                     |  |
|  | Batch Embedder (100/call, 3 concurrent)             |  |
|  +----------------------------------------------------+  |
+-----------------------------------------------------------+
|                  Data + Cache Layer                        |
|  +---------+  +----------+  +--------+  +-----------+    |
|  |Supabase |  | pgvector |  | Redis  |  | Response  |    |
|  |Postgres |  | + tsvec  |  | (jobs  |  | Cache     |    |
|  | (RLS)   |  | (hybrid) |  |  +pub/ |  | (Redis)   |    |
|  |         |  |          |  |  sub)  |  |           |    |
|  +---------+  +----------+  +--------+  +-----------+    |
+-----------------------------------------------------------+
```

---

## File Change Summary

### Modified Files (14)
| File | Change Type | Priority |
|------|------------|----------|
| `src/lib/crawler/index.ts` | Major refactor (concurrency, SPA detection) | Sprint 1 |
| `src/lib/crawler/browser-crawler.ts` | Full rewrite (browser pool) | Sprint 1 |
| `src/lib/crawler/content-extractor.ts` | Full rewrite (Readability) | Sprint 1 |
| `src/lib/crawler/chunker.ts` | Enhance (semantic boundaries, heading path) | Sprint 1 |
| `src/lib/crawler/boilerplate-dedup.ts` | Fix thresholds, post-crawl batch dedup | Sprint 1 |
| `src/lib/gemini/embeddings.ts` | Rewrite batch logic (batchEmbedContents) | Sprint 2 |
| `src/lib/queue/worker.ts` | Batch inserts, pub/sub progress, post-crawl profiling | Sprint 2 |
| `src/app/api/chat/route.ts` | Real streaming, query enhancement, caching | Sprint 3 |
| `src/lib/gemini/chat.ts` | Inline citations, streaming-first | Sprint 3 |
| `src/hooks/use-chat.ts` | Handle new streaming format | Sprint 3 |
| `src/components/agent/crawl-progress.tsx` | SSE-based real-time updates | Sprint 4 |
| `src/app/[locale]/(dashboard)/agents/new/page.tsx` | Crawl preview, advanced options | Sprint 4 |
| `src/components/chat/message-bubble.tsx` | Inline citations, feedback | Sprint 5 |
| `package.json` | Remove crawlee/playwright, add readability/p-limit | Sprint 1 |

### New Files (10)
| File | Purpose | Priority |
|------|---------|----------|
| `src/lib/crawler/structured-data.ts` | JSON-LD, Schema.org, OpenGraph extraction | Sprint 1 |
| `src/lib/crawler/browser-pool.ts` | Persistent Chromium instance pool | Sprint 1 |
| `src/lib/rag/query-enhancer.ts` | Query reformulation & expansion | Sprint 3 |
| `src/lib/rag/reranker.ts` | Gemini-based result re-ranking | Sprint 3 |
| `src/lib/rag/conversation-memory.ts` | Sliding window + summarization | Sprint 3 |
| `src/lib/rag/cache.ts` | Redis response & embedding cache | Sprint 6 |
| `src/lib/rag/company-profiler.ts` | Auto-generate company profile & system prompt | Sprint 5 |
| `src/app/api/crawl/preview/route.ts` | Pre-crawl analysis endpoint | Sprint 4 |
| `src/app/api/crawl/stream/route.ts` | SSE crawl progress endpoint | Sprint 4 |
| `src/app/[locale]/(dashboard)/agents/[id]/knowledge/page.tsx` | Knowledge browser UI | Sprint 5 |

### Database Migrations (1)
| File | Changes | Priority |
|------|---------|----------|
| `supabase/migrations/004_upgrade.sql` | feedback column on messages, summary on conversations, structured_data JSONB on pages | Sprint 3 |

---

## What NOT to Do
- Don't switch databases (Supabase + pgvector is the right choice)
- Don't switch to a different LLM provider (Gemini is fine)
- Don't add more features before fixing the crawler and RAG quality
- Don't over-abstract or add unnecessary layers
- Don't add tests before the core is working well (test after stabilization)
- Don't optimize for scale before proving the product works
