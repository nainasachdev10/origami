# Supabase Setup

This directory contains SQL migration files for the Origami project database.

## Prerequisites

Install the Supabase CLI:

```bash
brew install supabase/tap/supabase
```

Or via npm:

```bash
npm install -g supabase
```

## Creating a Supabase project

1. Go to https://supabase.com and create a free account.
2. Create a new project. Note down:
   - Project URL (e.g. `https://abcdefgh.supabase.co`)
   - Anon public key
   - Service role key (keep secret — only used server-side / n8n)

## Running migrations

### Option A — Supabase CLI (recommended)

Link your local repo to the remote project:

```bash
supabase login
supabase link --project-ref <your-project-ref>
```

Push all migrations:

```bash
supabase db push
```

Or run migrations one at a time:

```bash
supabase db push --db-url postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres
```

### Option B — Direct psql

If you have `psql` installed:

```bash
psql postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres \
  -f infra/supabase/migrations/001_initial_schema.sql

psql postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres \
  -f infra/supabase/migrations/002_rls_policies.sql

psql postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres \
  -f infra/supabase/migrations/003_indexes.sql
```

### Option C — Supabase Dashboard SQL Editor

Paste each migration file into the SQL Editor at:
`https://supabase.com/dashboard/project/<your-project-ref>/sql/new`

Run them in order: 001 → 002 → 003.

## Migration files

| File | Description |
|------|-------------|
| `001_initial_schema.sql` | Creates all tables: projects, project_platforms, content_pieces, content_analytics, trend_cache |
| `002_rls_policies.sql` | Enables RLS on every table and adds per-user access policies |
| `003_indexes.sql` | Adds performance indexes for common query patterns |

## Generating TypeScript types

Once the migrations are applied to a live project, regenerate types:

```bash
supabase gen types typescript \
  --project-id <your-project-ref> \
  --schema public \
  > packages/shared/src/types.ts
```

This replaces the hand-written types in `packages/shared/src/types.ts` with
generated output that exactly matches the live schema.

## Environment variables

After setup, add these to `.env` (copy from `.env.example`):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

The service role key bypasses RLS and is used only by:
- Server-side Next.js route handlers
- The n8n orchestration workflows
- The trend-research Python service

Never expose the service role key to the browser.

## Local development with Supabase CLI

```bash
# Start a local Supabase stack (Postgres + Auth + Studio)
supabase start

# Apply migrations to the local stack
supabase db reset

# Open local Studio
open http://localhost:54323
```

Local connection string for development:
`postgresql://postgres:postgres@localhost:54322/postgres`
