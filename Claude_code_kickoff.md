You are working on an autonomous content creation agent system. The complete specification lives in PROJECT_SPEC.md at the project root. READ IT IN FULL before doing anything else — it is your source of truth for architecture, stack, data model, agent pipeline, and phased plan.

Your job: scaffold and build this project autonomously, starting with Phase 1 (X bot MVP). Work in long, focused sessions. Don't ask me for permission on every small decision — make reasonable choices and document them in code comments or a DECISIONS.md file. Only stop and ask me when:
  (a) you need credentials or API keys I haven't provided
  (b) you hit a genuine architectural fork that changes the spec
  (c) Phase 1 is complete and you need me to test before Phase 2

## Step-by-step plan

Execute these in order. After each step, briefly summarize what you did and move to the next without waiting for approval.

### Step 0 — Read and verify
1. Read PROJECT_SPEC.md fully.
2. Print a 5-bullet summary of what you understood, so I can correct course if needed.
3. List every environment variable you'll need from me. Stop here ONLY if the spec is unclear; otherwise continue.

### Step 1 — Repo scaffolding
1. Initialize a pnpm + Turborepo monorepo at the project root.
2. Create the folder structure exactly as defined in section 6 of PROJECT_SPEC.md.
3. Set up TypeScript, ESLint, Prettier with sensible shared configs in `packages/config`.
4. Create `.env.example` with all variables from section 7 (placeholder values only).
5. Create `.gitignore` covering node_modules, .env, .next, dist, etc.
6. Initialize git, make the first commit.

### Step 2 — Supabase setup
1. Write SQL migrations in `infra/supabase/migrations/` for the schema in section 4 of the spec (projects, project_platforms, content_pieces, content_analytics, trend_cache).
2. Add row-level security policies for every table.
3. Generate TypeScript types from the schema and put them in `packages/shared/src/types.ts`.
4. Write a README in `infra/supabase/` explaining how to run migrations against a Supabase project.

### Step 3 — Dashboard skeleton (Next.js)
1. Scaffold the Next.js 14 app in `apps/dashboard/` with App Router, Tailwind, shadcn/ui.
2. Set up Supabase Auth with email + Google OAuth.
3. Build the auth flow: login page, protected layout, logout.
4. Build the projects list page (empty state for now).
5. Build the "New Project" form covering: name, niche keywords (tag input), brand voice (textarea), content style (select), platforms (checkboxes — start with just X), posting schedule (cron picker), approval mode (toggle, defaults to manual).
6. Wire form submission to Supabase via server actions.
7. Build the project detail page with tabs: Content, Analytics, Settings.

### Step 4 — Shared prompts package
Write the system prompts for each Claude agent in `packages/shared/src/prompts/`:
- `topic-selector.ts` — takes niche + trends + history, returns 1-3 topics as JSON
- `script-writer.ts` — platform-aware, takes topic + brand voice, returns script
- `quality-review.ts` — validates brand voice, facts, platform rules, returns pass/fail + reasons
- `seo-captions.ts` — generates titles, hashtags, descriptions

Each prompt must be a typed function returning a string, with example inputs/outputs in JSDoc.

### Step 5 — Trend research service
1. Build `packages/trend-research/` as a Python FastAPI service.
2. Implement source modules: google_trends.py (pytrends), reddit.py (praw), youtube_trending.py (Data API), nitter_rss.py (feedparser against nitter instances).
3. Expose a single endpoint `POST /research` that takes `{ niche_keywords: string[] }` and returns merged, deduplicated trend data.
4. Add caching: results are cached in Supabase `trend_cache` table for 6 hours.
5. Write a Dockerfile for this service.

### Step 6 — n8n workflows for Phase 1
Build these as n8n workflow JSON files in `apps/n8n-workflows/`. For each, include a README explaining the nodes:
1. `01-trend-research.json` — calls trend-research service, stores result
2. `02-topic-selector.json` — calls Claude with topic-selector prompt
3. `03-script-writer-x.json` — calls Claude with script-writer prompt for X format
4. `04-quality-review.json` — calls Claude with quality-review prompt, branches on pass/fail
5. `05-approval-telegram.json` — sends Telegram message with inline buttons, waits for callback
6. `06-publish-x.json` — calls OpenTweet API to post tweet/thread
7. `master-pipeline.json` — orchestrator that ties them all together, triggered by per-project cron

### Step 7 — Render deployment
1. Write `infra/n8n/render.yaml` Blueprint that deploys n8n on Render free tier with PostgreSQL.
2. Document in `infra/n8n/README.md`: how to set up the cron pinger via cron-job.org to prevent free-tier sleep.
3. Document the manual steps: connecting Supabase, importing workflows, setting credentials.

### Step 8 — Telegram bot
1. Build `apps/dashboard/app/api/webhooks/telegram/route.ts` to handle approval button callbacks.
2. Write helper in `packages/shared/src/telegram.ts` for sending preview messages with inline buttons.
3. Update content_pieces.status based on user response.

### Step 9 — End-to-end test
1. Write a test script in `scripts/test-e2e-x.ts` that:
   - Creates a test project for "AI tools" niche
   - Manually triggers the pipeline (without waiting for cron)
   - Verifies content_piece is created with status pending_approval
   - Verifies a Telegram message was sent
2. Document manual testing steps in `TESTING.md`.

### Step 10 — Phase 1 wrap-up
1. Update README.md with: what's built, how to run locally, how to deploy.
2. Create DECISIONS.md documenting any spec deviations or judgment calls.
3. Stop and ping me. Tell me exactly what I need to do to test it (create accounts, get API keys, etc.).

## Working principles

- **Commit often.** After each step, make a clean commit with a clear message.
- **Free-tier defaults.** Always pick the free option from the spec. Only use paid services where the spec mandates.
- **Type safety.** No `any`. Use generated Supabase types.
- **Idempotency.** Every n8n workflow must be retry-safe.
- **Don't fake it.** If you can't reach an external API to test, write the integration code, mock the call in tests, and document what needs real credentials.
- **Cost discipline.** Cache trend data. Don't loop Claude calls without max retries (3). Use Sonnet 4 (`claude-sonnet-4-20250514`) only — no Opus unless the spec says so.
- **Tell me when stuck.** Better to ask one good question than ship broken code.

Begin with Step 0 now.