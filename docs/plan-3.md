# Embeddable Chat Widget NPM Package - Implementation Plan

## Context

AgentForge users build RAG chatbots by crawling their websites. Currently, the only way to use these chatbots is through the platform's public agent page (`/:locale/agent/:slug`). We want to let users embed their agent as a chat widget on **their own websites** -- similar to how Intercom, Crisp, or Datafast embed scripts.

The end result: a user registers on AgentForge, crawls their site, then copies a `<script>` tag (or installs an NPM package) to add a floating chat bubble to their website. Visitors click it, chat with an AI that knows the website's content, and get answers with source citations.

**What exists today**: Full SSE streaming chat API, rich chat UI components, conversation management, rate limiting, bot detection. **What's missing**: No API key system, no CORS headers, no embeddable widget, no NPM package.

---

## Phase 1: Backend - Widget Auth & API Infrastructure

### 1.1 Database Migration

**File**: `supabase/migrations/008_widget_api_keys.sql`

Two new tables:

**`widget_api_keys`** - One or more public keys per agent:
- `id` UUID PK
- `agent_id` UUID FK -> agents (CASCADE)
- `public_key` TEXT UNIQUE (`pk_` + 32-char hex)
- `label` TEXT (user-facing name)
- `allowed_origins` TEXT[] DEFAULT '{}' (canonicalized origins: `scheme://host[:port]`, no paths/trailing slashes)
- `rate_limit_per_minute` INT DEFAULT 30
- `is_active` BOOLEAN DEFAULT true
- `created_by` UUID FK -> profiles
- `created_at`, `updated_at`

Note: `secret_hash` removed from v1 (Codex feedback #1 -- simplify). Can be added later for server-side SDK.

**`widget_sessions`** - Short-lived sessions created by widget init:
- `id` UUID PK
- `api_key_id` UUID FK -> widget_api_keys (CASCADE)
- `agent_id` UUID FK -> agents (CASCADE)
- `session_token` TEXT UNIQUE (HMAC-signed)
- `session_jti` TEXT UNIQUE (JWT ID -- stable identifier embedded in token, survives refresh)
- `origin` TEXT
- `expires_at` TIMESTAMPTZ
- `created_at`

Note: `conversation_id` removed from this table (Codex feedback #1). Conversations are linked to the `session_jti` instead, allowing multiple conversations per widget session. The `session_jti` is stored in the signed token AND in localStorage, so it survives page reloads even when the token itself is refreshed.

**Origin normalization** (Codex feedback #7): Origins are validated server-side before DB insert using two regex patterns:
- Exact origins: `^https?://[a-z0-9._-]+(:[0-9]+)?$` (e.g., `https://example.com`, `http://localhost:3000`)
- Wildcard subdomains: `^https?://\*\.[a-z0-9._-]+(:[0-9]+)?$` (e.g., `https://*.example.com`)

No DB-level CHECK constraint (Postgres array element constraints are awkward). Instead, validation is enforced in the API route (`POST /api/agents/[id]/widget-keys`) and the dashboard UI before insert. The `canonicalizeOrigin()` utility lowercases, strips trailing slashes/paths, and rejects invalid formats.

Indexes: `public_key`, `session_token`, `session_jti`, `expires_at`, `agent_id`.
RLS: agent owners manage keys; sessions service-role only.
Update `usage_events` check constraint to include `'widget_chat'` and `'widget_session'`.

### 1.2 Widget Auth Library

**File**: `src/lib/security/widget-auth.ts`

Follow the pattern in `src/lib/security/passcode-session.ts`:

- `generatePublicKey()` -> `pk_` + 32 bytes crypto random hex
- `createWidgetSessionToken(agentId, apiKeyId, origin, sessionJti)` -> HMAC-SHA256 signed token, 24hr TTL. Payload includes `{ agentId, apiKeyId, origin, jti, iat, exp }`. The `jti` is a stable UUID that identifies this widget session across token refreshes.
- `verifyWidgetSessionToken(token)` -> validate signature + expiration, return payload
- `refreshWidgetSessionToken(oldToken)` -> verify old token (even if expired within grace period of 1hr), issue new token with same `jti` but new `exp`
- **REQUIRES** `WIDGET_SESSION_SECRET` env var. Fails fast with a clear error if missing. No fallback to `SUPABASE_SERVICE_ROLE_KEY` (Codex feedback #8).

**Session identity model** (Codex feedback #1):
- Each widget init generates a `session_jti` (UUID). This is the **authoritative session identifier**.
- The `session_jti` is stored in both the signed token AND in localStorage (`af_widget_{agentId}_jti`).
- On page reload, the widget reads `session_jti` from localStorage, calls `/api/widget/session` with both `api_key` and `session_jti` to get a fresh token for the same session.
- Conversations are created with `session_id = session_jti`, matching the existing schema pattern.
- Conversation ownership: every chat request validates `conversation.agent_id = token.agentId AND conversation.session_id = token.jti` (Codex feedback #4).

### 1.3 CORS Utility

**File**: `src/lib/security/cors.ts`

**Preflight (OPTIONS)** (Codex feedback #2):
- Returns **generic** CORS headers since API key is in POST body, not available during preflight
- `Access-Control-Allow-Origin: <request Origin>` (echo back -- permissive on preflight)
- `Access-Control-Allow-Methods: POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization`
- `Access-Control-Max-Age: 86400`

**Actual POST requests**:
- After reading the API key from the body, look up `allowed_origins` for that key
- If `allowed_origins` is empty AND `NODE_ENV !== 'production'`, allow all origins (log warning to console). In production, empty `allowed_origins` means **reject all** (forces explicit configuration).
- If `allowed_origins` is non-empty, validate `Origin` against the list
- Origin matching: exact match OR wildcard subdomain match (e.g., `https://*.example.com` matches `https://app.example.com` and `https://docs.example.com` but NOT `https://example.com` itself)
- If origin not allowed, return 403 (not a CORS error -- the preflight already succeeded)
- Set `Access-Control-Allow-Origin: <validated origin>` on successful responses

Helper functions:
- `createCorsHeaders(origin: string)` -> header dict
- `handlePreflight(request: Request)` -> 204 Response with generic CORS headers
- `validateOrigin(origin: string, allowedOrigins: string[])` -> boolean
- `canonicalizeOrigin(raw: string)` -> normalized `scheme://host[:port]`

### 1.4 Extract Shared Chat Service

**File**: `src/lib/chat/core.ts` (new, extracted from `src/app/api/chat/route.ts`)

**Full service extraction** (Codex feedback #3 -- extract the complete pipeline, not just the stream):

```typescript
interface ChatServiceRequest {
  supabase: SupabaseClient;
  agentId: string;
  agent: Agent;
  agentSettings: AgentSettings | null;
  message: string;
  sessionId: string;
  conversationId?: string;
  shareToken?: string;        // only used by /api/chat route
  eventType: 'chat' | 'widget_chat';
  clientIp: string;
}

interface ChatServiceResult {
  stream: ReadableStream;
  conversationId: string;
}

async function runChatRequest(req: ChatServiceRequest): Promise<ChatServiceResult>
```

`runChatRequest()` handles the **entire pipeline**:
1. Get or create conversation (validates ownership: `conversation.agent_id = agentId AND conversation.session_id = sessionId`)
2. Load conversation history (up to 20 messages)
3. Save user message
4. Build conversation context with memory management
5. Retrieve relevant chunks (hybrid search + reranking)
6. Create streaming response (with structured fallback)
7. Save assistant message + sources
8. Record usage event
9. Return the ReadableStream

Also extract as standalone functions (for reuse):
- `retrieveRelevantChunks()`
- `loadPageMapForChunks()`
- `buildContextSources()`, `buildSourceFromChunk()`, `buildValidatedStructuredSources()`
- `getOrCreateQueryEmbedding()`, `mergeMatchedChunks()`

The existing `/api/chat/route.ts` becomes a thin wrapper:
1. Bot detection
2. Rate limiting (IP + session)
3. Auth validation (visibility, share token, passcode)
4. Call `runChatRequest()` with `eventType: 'chat'`
5. Return stream with headers

### 1.5 New API Endpoints

#### `POST /api/widget/session` -> Session creation + refresh

**File**: `src/app/api/widget/session/route.ts`

**Request**: `{ "api_key": "pk_abc123...", "session_jti": "optional-uuid-for-refresh" }`

**Flow**:
1. Handle OPTIONS preflight -> generic CORS 204
2. Validate `api_key` in `widget_api_keys` (active check)
3. Look up agent; confirm `agent.status === 'ready'`
4. Validate `Origin` against `allowed_origins` for this key (Codex feedback #2 -- on POST, not preflight)
5. If `session_jti` provided: look up existing session, verify it belongs to this key+agent, refresh token with same jti
6. If no `session_jti`: generate new `session_jti` (UUID), create new session
7. Insert/update `widget_sessions`
8. Return `{ session_token, session_jti, agent: { id, name, welcome_message, starter_questions, theme_color }, expires_at }`
9. Record `widget_session` usage event
10. Add CORS headers to response

**Rate limit**: `RATE_LIMITS.widgetSession` (10 sessions/min per IP)

#### `POST /api/widget/chat` -> Widget chat (streaming)

**File**: `src/app/api/widget/chat/route.ts`

**Request**: `{ "message": "...", "conversation_id": "optional" }`
**Header**: `Authorization: Bearer <session_token>`

**Flow**:
1. Handle OPTIONS preflight -> generic CORS 204
2. Extract and verify session token from `Authorization` header
3. Look up `widget_sessions` row, verify not expired, get `api_key_id`
4. Look up `widget_api_keys`, verify `is_active`
5. Validate `Origin` against `allowed_origins`
6. Rate limit: per API key (`widget:key:{apiKeyId}`, key's `rate_limit_per_minute`) + per IP (reuse `RATE_LIMITS.chat`)
7. Call `runChatRequest()` with `sessionId = token.jti`, `eventType: 'widget_chat'`
8. Return SSE stream with CORS headers
9. Handle expired-session-mid-stream: if token expires during streaming, complete the current response (don't cut off mid-message)

**SSE event schema** (Codex feedback #9 -- explicitly define, preserving all existing fields):
```
data: {"type":"text","content":"chunk..."}\n\n
data: {"type":"sources","sources":[...],"conversation_id":"uuid","confidence":0.85,"model_used":"gemini-3.1-flash-lite-preview","answered_from_sources_only":true,"message_id":"uuid"}\n\n
data: {"type":"error","content":"error message"}\n\n
data: [DONE]\n\n
```

This is the **exact same schema** as `/api/chat` -- guaranteed by both routes calling `runChatRequest()`.

#### `GET/POST /api/agents/[id]/widget-keys` -> Key management (dashboard)

**File**: `src/app/api/agents/[id]/widget-keys/route.ts`

- GET: List all keys for agent (Supabase auth, agent owner only)
- POST: Create new key with `{ label, allowed_origins[] }`. Origins are canonicalized server-side via `canonicalizeOrigin()`. Invalid origins rejected with 400.

#### `PATCH/DELETE /api/agents/[id]/widget-keys/[keyId]` -> Single key ops

**File**: `src/app/api/agents/[id]/widget-keys/[keyId]/route.ts`

- PATCH: Update label, origins (re-canonicalized), rate limit, active status
- DELETE: Hard delete (cascades to widget_sessions)

### 1.6 Widget Visibility Policy (Codex feedback -- open question)

Widget embedding requires `agent.visibility` to be `'public'`. Private and passcode agents cannot be embedded via widget -- they require the platform's own share link / passcode flow. This is enforced at both session creation and chat time.

Rationale: widget keys are already a form of controlled access. Mixing passcode/private visibility with widget auth creates confusing UX and security surface.

### 1.7 Modify Existing Files

| File | Change |
|------|--------|
| `src/app/api/chat/route.ts` | Refactor to thin wrapper calling `runChatRequest()` from `src/lib/chat/core.ts`. Auth validation stays in route. |
| `src/lib/rate-limiter.ts` | Add `RATE_LIMITS.widgetChat` (30/min, 60s block) and `RATE_LIMITS.widgetSession` (10/min, 60s block) |
| `src/lib/usage-logger.ts` | Add `'widget_chat'` and `'widget_session'` to event types |
| `src/types/index.ts` | Add `WidgetApiKey` and `WidgetSession` interfaces |
| `next.config.ts` | No static CORS headers needed (all handled dynamically in route handlers) |

### 1.8 Rate Limiting Strategy (Codex feedback #6)

**v1 (current scope)**: Continue using in-memory rate limiter. This is acceptable because:
- AgentForge currently runs as a single Next.js instance
- The existing `/api/chat` already uses in-memory limiting for public agents
- Widget endpoints get the same treatment

**v2 (future, when scaling)**: Migrate to Redis-based rate limiting using the existing `ioredis` dependency. The `checkRateLimit()` interface remains the same; only the store changes. This is noted as a TODO but not blocking v1 launch.

---

## Phase 2: NPM Package - Structure & Build

### 2.1 Directory Layout

```
packages/
  widget/
    package.json
    tsconfig.json
    tsup.config.ts
    src/
      index.ts                # React component exports
      embed.ts                # IIFE entry (script tag)
      types.ts                # Shared TypeScript types
      core/
        client.ts             # API client (fetch + SSE stream parsing)
        session.ts            # Session management (init, jti persistence, refresh)
        storage.ts            # localStorage conversation persistence
        events.ts             # Event emitter for lifecycle hooks
      components/
        Widget.tsx            # Top-level orchestrator
        ChatBubble.tsx        # Floating bubble button (bottom-right/left)
        ChatPanel.tsx         # Chat overlay panel
        MessageList.tsx       # Scrollable message list
        MessageBubble.tsx     # Single message (user/assistant)
        ChatInput.tsx         # Text input + send button
        SourceList.tsx        # Collapsible source citations
        WelcomeScreen.tsx     # Welcome + starter questions
        PoweredBy.tsx         # "Powered by AgentForge" footer
      styles/
        widget.css            # All CSS with custom properties
      utils/
        shadow-dom.ts         # Shadow DOM creation + style injection
        markdown.ts           # Lightweight markdown renderer (~2KB)
        cn.ts                 # Minimal classname utility
```

### 2.2 Workspace Setup (Codex feedback #5)

**Root `package.json`** changes:
```json
{
  "workspaces": ["packages/*"]
}
```

Add root-level scripts:
```json
{
  "scripts": {
    "widget:build": "npm -w packages/widget run build",
    "widget:dev": "npm -w packages/widget run dev"
  }
}
```

The widget package is developed and built within the monorepo but published independently to npm. No Turborepo needed for a single workspace.

**Versioning**: Manual version bumps in `packages/widget/package.json`. Publish via `npm publish` from `packages/widget/`. Changeset automation can be added later when the release cadence justifies it.

### 2.3 Build Config (tsup)

Two build targets:

1. **React component** (ESM + CJS): Externalizes `react` and `react-dom` as peer deps. Outputs `dist/index.mjs`, `dist/index.cjs`, `dist/index.d.ts`.

2. **IIFE embed** (standalone script): Aliases React -> Preact via `esbuild.alias`. Bundles everything including Preact (~3KB). Outputs `dist/embed.global.js`. CSS injected into JS as string constant (loaded into Shadow DOM at runtime). **Target: <50KB gzipped**.

### 2.4 Package Exports

```json
{
  "name": "@agentforge/chat-widget",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": {
      "import": { "types": "./dist/index.d.ts", "default": "./dist/index.mjs" },
      "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
    },
    "./embed.js": "./dist/embed.global.js"
  },
  "main": "./dist/index.cjs",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "peerDependencies": { "react": ">=18", "react-dom": ">=18" },
  "peerDependenciesMeta": { "react": { "optional": true }, "react-dom": { "optional": true } }
}
```

---

## Phase 3: Widget Core Logic

### 3.1 API Client (`core/client.ts`)

Framework-agnostic. Ported from `src/hooks/use-chat.ts` SSE parsing logic (lines 176-205):

```typescript
class AgentForgeClient {
  constructor(config: { apiKey: string; baseUrl?: string })
  async initSession(existingJti?: string): Promise<{ agentConfig: AgentConfig; sessionJti: string }>
  async *sendMessage(message: string, conversationId?: string): AsyncGenerator<StreamEvent>
}
```

**StreamEvent types** (Codex feedback #9 -- full schema):
- `{ type: 'text', content: string }`
- `{ type: 'sources', sources: SourceCitation[], conversationId: string, confidence: number | null, modelUsed: string, answeredFromSourcesOnly: boolean, messageId: string }`
- `{ type: 'done' }`
- `{ type: 'error', message: string }`

The client automatically handles:
- Session token refresh (calls `initSession(jti)` when token nears expiry)
- Bearer token attachment on all requests
- SSE stream parsing with buffer management (same algorithm as `use-chat.ts`)

### 3.2 Session Manager (`core/session.ts`)

**Session identity** (Codex feedback #1 -- redesigned):
- `session_jti` stored in localStorage: `af_widget_{agentId}_jti` (stable across reloads)
- Session token stored in memory (refreshed on each page load using the persisted `jti`)
- On init: check localStorage for existing `jti` -> call `initSession(jti)` to get fresh token
- If no existing `jti`: call `initSession()` to create new session, store returned `jti`
- Auto-refresh: when token is within 1hr of expiry, silently refresh using `initSession(jti)`

**Conversation persistence** (`core/storage.ts`):
- `session_jti` stored in localStorage (shared across tabs): `af_widget_{agentId}_jti`
- Conversation ID and messages stored in **sessionStorage** (per-tab): `af_widget_{agentId}_conv`, `af_widget_{agentId}_msgs`
- This means: tabs share the same session identity (jti) but each tab has its own independent conversation. Opening the widget in a new tab starts a fresh conversation under the same session.
- "New Conversation" clears conversation ID and messages from sessionStorage but keeps `jti` in localStorage
- `persistConversation` prop defaults to **false**. When false, each tab gets its own conversation (sessionStorage only). When true, conversation ID is **also** written to localStorage, which means: (a) the conversation resumes across browser sessions, and (b) new tabs will pick up the last active conversation from localStorage instead of starting fresh. This is an explicit opt-in to shared conversation state.

### 3.3 Shadow DOM (`utils/shadow-dom.ts`)

- Creates `<div id="agentforge-widget">` -> `attachShadow({ mode: 'open' })`
- Injects CSS string as `<style>` tag inside shadow root
- Sets `all: initial` on root container to prevent inheritance from host page
- All widget rendering happens inside the shadow DOM -> complete CSS isolation

### 3.4 Lightweight Markdown (`utils/markdown.ts`)

Minimal renderer (~2KB) supporting: bold, italic, inline code, code blocks, lists, links, headings, line breaks. HTML-entity escaping **before** markdown parsing for XSS prevention. No `react-markdown` or `remark` dependency.

---

## Phase 4: Widget UI Components

### 4.1 Component Tree

```
Widget (orchestrator: manages open/close state, client, session)
  |-- ChatBubble (floating button, customizable icon/position)
  |-- ChatPanel (overlay panel, animated slide-up)
       |-- Header (agent name, close btn, new chat btn)
       |-- WelcomeScreen (when no messages)
       |    |-- StarterQuestions
       |-- MessageList (auto-scroll)
       |    |-- MessageBubble (user)
       |    |-- MessageBubble (assistant + streaming indicator)
       |         |-- SourceList (expandable citations)
       |-- ChatInput (textarea + send)
       |-- PoweredBy (branding footer)
```

### 4.2 Configuration Props

```typescript
interface AgentForgeChatProps {
  apiKey: string;                              // Required: pk_xxx
  baseUrl?: string;                            // Default: platform URL
  position?: 'bottom-right' | 'bottom-left';  // Bubble position
  theme?: 'light' | 'dark' | 'auto';          // Color scheme
  primaryColor?: string;                       // Override theme_color
  bubbleIcon?: string;                         // Custom icon
  width?: number;                              // Panel width (default: 400)
  height?: number;                             // Panel height (default: 600)
  openOnLoad?: boolean;                        // Auto-open
  persistConversation?: boolean;               // Cross-session resume via localStorage (default: false)
  showSources?: boolean;                       // Show citations (default: true)
  showPoweredBy?: boolean;                     // Branding (default: true)
  onOpen?: () => void;
  onClose?: () => void;
  onMessage?: (msg: ChatMessage) => void;
  onError?: (err: Error) => void;
}
```

### 4.3 CSS Strategy

All styles in `widget.css` using CSS custom properties:

```css
:host {
  all: initial;
  --af-primary: #171717;
  --af-bg: #ffffff;
  --af-text: #171717;
  --af-border: #e5e5e5;
  --af-radius: 16px;
  --af-font: system-ui, -apple-system, sans-serif;
}
```

Dark mode: Override variables when `data-theme="dark"` or `@media (prefers-color-scheme: dark)`. No Tailwind dependency -- plain CSS keeps the bundle small.

---

## Phase 5: Integration Methods

### 5.1 Script Tag (Vanilla JS / Any Framework)

```html
<script
  src="https://cdn.jsdelivr.net/npm/@agentforge/chat-widget/dist/embed.global.js"
  data-api-key="pk_abc123..."
  data-position="bottom-right"
  data-theme="auto"
  async
></script>
```

The embed entry reads `data-*` attributes from `document.currentScript`, creates a Shadow DOM container, renders the widget with Preact.

Global API for programmatic control:
```javascript
window.AgentForge.open()
window.AgentForge.close()
window.AgentForge.toggle()
```

### 5.2 React Component

```tsx
import { AgentForgeChat } from '@agentforge/chat-widget';

export default function Layout({ children }) {
  return (
    <>
      {children}
      <AgentForgeChat apiKey="pk_abc123..." theme="auto" />
    </>
  );
}
```

---

## Phase 6: Dashboard - Widget Key Management UI

### 6.1 New Section in Agent Detail Page

**File**: `src/app/[locale]/(dashboard)/agents/[id]/page.tsx`

Add an "Embed Widget" card with:
- List of API keys (public key masked, label, origins, active status)
- "Create API Key" form (label, comma-separated allowed origins with validation feedback)
- Origin validation in UI: must be `https://...` or `http://localhost:...`, no paths
- Toggle active/inactive, delete
- **Code snippet tabs** (Script Tag / React) with copy button, pre-filled with the key
- Only shown when `agent.visibility === 'public'` (widget requires public agents)

### 6.2 i18n

Add `widget.*` keys to `src/i18n/messages/en-product.ts` and `ko-product.ts`.

---

## Phase 7: Security

| Layer | Implementation |
|-------|---------------|
| **Auth** | Public key (`pk_xxx`) -> server validates -> returns session token (24hr) with embedded `jti` |
| **Session identity** | `session_jti` (UUID) is the authoritative session identifier, stored in token AND localStorage |
| **Origin** | Preflight: generic CORS. POST: validate `Origin` against per-key `allowed_origins` after reading key from body |
| **Conversation ownership** | Every chat validates `conversation.agent_id = token.agentId AND conversation.session_id = token.jti` (Codex #4) |
| **Rate limit** | Triple: per API key + per IP + per session (in-memory v1, Redis v2) |
| **Token secret** | Dedicated `WIDGET_SESSION_SECRET` env var required. Fails fast if missing. No fallback. |
| **CSS isolation** | Shadow DOM with `all: initial` prevents host page CSS leakage in both directions |
| **XSS** | Markdown renderer escapes HTML entities before parsing. No `innerHTML` with unsanitized content. |
| **Links** | All external links: `target="_blank" rel="noopener noreferrer"` |
| **Bot detection** | Reuse existing `isLikelyBot()` on widget endpoints |
| **Visibility** | Only `public` agents can be embedded via widget. Private/passcode agents blocked. |

---

## Implementation Order

| Step | Task | Files | Depends On |
|------|------|-------|------------|
| **1** | DB migration | `supabase/migrations/008_widget_api_keys.sql` | - |
| **2** | Widget auth library | `src/lib/security/widget-auth.ts` | 1 |
| **3** | CORS utility | `src/lib/security/cors.ts` | - |
| **4** | Extract chat service | `src/lib/chat/core.ts`, refactor `src/app/api/chat/route.ts` | - |
| **5** | Update types + rate limiter + usage logger | `src/types/index.ts`, `src/lib/rate-limiter.ts`, `src/lib/usage-logger.ts` | - |
| **6** | Widget session endpoint | `src/app/api/widget/session/route.ts` | 2, 3, 5 |
| **7** | Widget chat endpoint | `src/app/api/widget/chat/route.ts` | 3, 4, 5 |
| **8** | Widget key management API | `src/app/api/agents/[id]/widget-keys/route.ts` + `[keyId]/route.ts` | 1, 5 |
| **9** | Workspace setup + package scaffold | Root `package.json` workspaces, `packages/widget/` (package.json, tsup, tsconfig) | - |
| **10** | Widget core (client, session, storage) | `packages/widget/src/core/*` | 6, 7 |
| **11** | Widget components | `packages/widget/src/components/*` | 10 |
| **12** | Widget CSS + Shadow DOM | `packages/widget/src/styles/*`, `packages/widget/src/utils/shadow-dom.ts` | 11 |
| **13** | IIFE embed entry | `packages/widget/src/embed.ts` | 11, 12 |
| **14** | React component entry | `packages/widget/src/index.ts` | 11 |
| **15** | Dashboard widget UI | Agent detail page + i18n | 8 |

Steps 1-5, 9 can run in parallel. Steps 6-8 depend on 1-5. Steps 10-14 are sequential. Step 15 can run in parallel with 10-14.

---

## Verification

### Backend
1. Run migration against local Supabase
2. `POST /api/widget/session` with valid `pk_xxx` key -> get session token + jti
3. `POST /api/widget/chat` with Bearer token + message -> receive full SSE stream (text + sources with confidence, message_id, answered_from_sources_only)
4. Verify existing `/api/chat` still works identically after core extraction refactor
5. Verify CORS: `curl -X OPTIONS /api/widget/session -H "Origin: https://test.com"` -> 204 with generic headers
6. Verify origin enforcement: POST with wrong Origin after key lookup -> 403
7. Verify conversation ownership: attempt to use conversation_id from different session -> rejected

### Security & Edge Cases (Codex feedback #10)
1. **Revoked key**: Set `is_active = false` -> next session/chat call returns 403
2. **Changed allowlist**: Update `allowed_origins` -> requests from old origin rejected immediately
3. **Expired session mid-stream**: Token expires during streaming -> current response completes, next request gets 401
4. **Reload with persisted conversation**: Page reload -> widget reads `jti` from localStorage -> refreshes token -> resumes conversation seamlessly
5. **Concurrent tabs**: Same `jti` used across tabs (shared via localStorage). Each tab has its own conversation (stored in sessionStorage). Opening widget in Tab B while chatting in Tab A -> Tab B gets a fresh conversation. Both tabs authenticate with the same session identity.
6. **Conversation ownership**: Attempt to load conversation with wrong `agent_id` or `session_id` -> rejected, new conversation created
7. **Invalid origin on preflight**: Preflight always succeeds (generic CORS). POST with wrong origin -> 403 after key lookup.
8. **Bot detection**: Widget chat endpoint applies `isLikelyBot()` -> 403 for automated clients

### Widget Package
1. `cd packages/widget && npm run build` -> outputs `dist/index.mjs`, `dist/embed.global.js`
2. Check IIFE bundle size < 50KB gzipped
3. Create test HTML page with `<script data-api-key="pk_xxx" src="./dist/embed.global.js"></script>`
4. Verify: bubble appears, click opens panel, send message, stream response, sources shown with confidence badge
5. Create test React app: `<AgentForgeChat apiKey="pk_xxx" />` -> same behavior
6. Verify Shadow DOM isolation: host page CSS does not affect widget, widget CSS does not leak
7. Verify page reload: conversation resumes with same messages

### Dashboard
1. Navigate to agent detail page -> "Embed Widget" card visible (only for public agents)
2. Create API key with allowed origins (validates format)
3. Copy script tag snippet -> paste into test page -> widget works
4. Toggle key inactive -> widget shows error on next session init
