# AgentForge RAG Platform

Production-oriented RAG agent builder built with Next.js, Supabase, Gemini, and BullMQ.

## What It Does

- Crawls a website (HTTP first, browser fallback)
- Extracts and chunks content
- Generates embeddings and stores them in pgvector
- Serves a public/private/passcode-protected chat agent
- Supports share links, analytics, scheduled recrawls, and eval runs

## Tech Stack

- Next.js 16 + React 19 + TypeScript
- Supabase (Postgres + pgvector + Auth)
- Gemini (`@google/genai`) for embeddings and chat
- Redis + BullMQ for crawl jobs
- `next-intl` (English/Korean)

## Prerequisites

- Node.js 20+
- npm
- Redis (local or remote)
- Supabase project (cloud or local via `docker compose`)

## Environment

Copy `.env.local.example` to `.env.local` and set values.

Required:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `REDIS_URL`
- `NEXT_PUBLIC_APP_URL`
- `PASSCODE_SESSION_SECRET` (long random secret)

Optional:

- `WEBHOOK_SECRET` for `/api/webhooks/crawler`
- `METRICS_API_KEY` for `/api/metrics`
- `WILDCARD_DOMAIN`

## Database Setup

Migrations are in `supabase/migrations` and applied in filename order.

Print combined SQL:

```bash
npx tsx scripts/setup-db.ts
```

Or apply via Supabase CLI:

```bash
npx supabase db push
```

## Local Development

Install dependencies:

```bash
npm ci
```

Run app:

```bash
npm run dev
```

Run crawl worker (required for crawling jobs):

```bash
npm run worker
```

Optional background jobs:

```bash
npm run recrawl-scheduler
npm run nightly-eval
```

## Docker (Local Infra)

`docker-compose.yml` provisions Supabase services + Redis.

```bash
docker compose up -d
docker compose down
```

Useful endpoints:

- Supabase Studio: `http://localhost:3001`
- Supabase API Gateway: `http://localhost:8000`
- Redis: `localhost:6379`

## Quality Checks

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## Notes

- `/api/metrics` requires `METRICS_API_KEY` when configured.
- Passcode-protected agents rely on secure HTTP-only passcode session cookies.
- Share-link usage is incremented when a new conversation is created.
