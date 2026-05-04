# Autonomous Content Creation Agent — Project Specification

> **Purpose of this file:** Single source of truth for Claude Code / Cursor / any AI coding agent working on this project. Read this before writing any code. Re-read it when context gets long.

---

## 1. What we're building

A **project-based autonomous content creation system** where:

1. The user opens a dashboard, clicks "New Project", and configures a niche (e.g., "AI Tech Reviews"), target platforms (YouTube / Instagram / X), brand voice, and posting schedule.
2. The system runs autonomously every day for each project: researches trends → picks topics → writes scripts → generates videos + thumbnails → reviews quality → sends a Telegram approval preview → publishes to all configured platforms → tracks analytics → feeds learnings back into the next cycle.
3. The user can spin up unlimited projects, each with its own pipeline running in parallel.

**The differentiator:** Existing tools (Buffer, Hootsuite, n8n templates, NoimosAI) handle individual pieces — scheduling, captioning, video gen — but nobody has packaged a project-based autonomous loop where you define a niche and the system owns the entire trend-to-publish-to-learn cycle. That's the gap we're filling.

**Autonomy level:** Level 2-3 (autonomous with optional human approval gate). Approval mode toggles per project: `manual` (Telegram preview before publish) or `auto` (publish directly, daily summary instead).

---

## 2. Architecture overview

```
[User Dashboard]                          [Notification]
  Next.js on Vercel                          Telegram Bot
        │                                        ▲
        │ creates / manages projects             │ approval previews
        ▼                                        │
  [Supabase Postgres]  ◄──────────  [n8n on Render free tier]
   - projects                            │
   - content_history                     │ runs per-project cron
   - analytics                           │
   - credentials (encrypted)             ▼
                                  ┌─────────────────────────┐
                                  │  Per-project pipeline   │
                                  │  1. Trend research      │
                                  │  2. Topic selector      │
                                  │  3. Script + media gen  │
                                  │  4. Quality review      │
                                  │  5. Approval gate       │
                                  │  6. Publish (YT/IG/X)   │
                                  │  7. Analytics + learn   │
                                  └─────────────────────────┘
                                          │
                                          ▼
                                  [Cloudflare R2 / Supabase Storage]
                                   videos, thumbnails, audio
```

---

## 3. Stack decisions (locked)

| Layer | Choice | Why |
|---|---|---|
| Dashboard frontend | **Next.js 14 (App Router) on Vercel** | Free tier, fast, best DX |
| Auth + database | **Supabase** | Free tier covers MVP; Postgres + auth + RLS |
| Agent orchestration | **n8n self-hosted on Render free tier** | Visual workflows, cron, free 750hr/mo |
| LLM brain | **Anthropic API (Claude Sonnet 4)** | Best for agentic tasks; model id: `claude-sonnet-4-20250514` |
| Image generation | **Pollinations.ai** (free Flux API) → fallback **Replicate Flux** (~$0.04/img) | Free tier first, paid only if rate-limited |
| Voiceover (TTS) | **Microsoft Edge TTS** (free, no API key) via `edge-tts` Python lib | Great quality, $0 |
| Video assembly | **Remotion** (open source, React-based) | Free, programmable, runs in n8n via Node |
| X (Twitter) posting | **OpenTweet API** ($5.99/mo) | 1/16th cost of official, simpler auth |
| X trend research | **Nitter RSS** + **Apify pay-per-event scraper** | Free / pennies vs $100/mo |
| YouTube | **YouTube Data API v3** (official, free quota) | Required for upload |
| Instagram | **Instagram Graph API** (official, free) | Requires FB Business account |
| Trend sources (extra) | **Google Trends (pytrends)**, **Reddit API**, **YouTube trending**, **RSS** | All free |
| Notifications | **Telegram Bot API** | Free, mobile-friendly |
| Media storage | **Cloudflare R2** (10GB free) | Cheap, no egress fees |

**Total monthly cost target: $36-77/month** (mostly Anthropic API tokens + OpenTweet).

---

## 4. Data model (Supabase Postgres)

```sql
-- Users (handled by Supabase Auth)

-- Projects: each is one "channel/page" the agent runs for
create table projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  name text not null,                          -- "AI Tech Reviews"
  niche_keywords text[] not null,              -- ["AI", "LLMs", "tech news"]
  brand_voice_prompt text not null,            -- system prompt fragment
  content_style text not null,                 -- "long-form" | "short-form" | "thread" | "carousel"
  video_style text,                            -- "text-overlay" | "stock-footage" | "avatar"
  approval_mode text default 'manual',         -- "manual" | "auto"
  posting_schedule jsonb not null,             -- { "cron": "0 10 * * *", "timezone": "Asia/Kolkata" }
  active boolean default true,
  created_at timestamptz default now()
);

-- Per-project platform configurations
create table project_platforms (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade not null,
  platform text not null,                      -- "youtube" | "instagram" | "x"
  account_handle text,
  credentials_encrypted jsonb,                 -- OAuth tokens, encrypted
  enabled boolean default true,
  unique (project_id, platform)
);

-- Content pieces generated by the agent
create table content_pieces (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade not null,
  topic text not null,
  angle text,
  script text,
  caption text,
  hashtags text[],
  thumbnail_url text,
  video_url text,
  status text default 'draft',                 -- draft | pending_approval | approved | rejected | published | failed
  platforms_published jsonb default '{}',      -- { "youtube": "video_id", "x": "post_id" }
  created_at timestamptz default now(),
  scheduled_for timestamptz,
  published_at timestamptz
);

-- Analytics pulled back from each platform
create table content_analytics (
  id uuid primary key default gen_random_uuid(),
  content_piece_id uuid references content_pieces on delete cascade not null,
  platform text not null,
  views integer default 0,
  likes integer default 0,
  comments integer default 0,
  shares integer default 0,
  ctr numeric,                                 -- for YouTube
  reach integer,                               -- for IG
  fetched_at timestamptz default now()
);

-- Trend cache (so we don't hit APIs repeatedly within a day)
create table trend_cache (
  id uuid primary key default gen_random_uuid(),
  source text not null,                        -- "google_trends" | "reddit" | "x" | "youtube"
  niche_keywords text[] not null,
  payload jsonb not null,
  fetched_at timestamptz default now()
);

-- Row-level security: users only see their own projects
alter table projects enable row level security;
create policy "users see own projects" on projects for all using (auth.uid() = user_id);
-- Repeat RLS for related tables via project_id joins
```

---

## 5. The 7-step agent pipeline (per project, per day)

### Step 1 — Trend research agent
**Inputs:** project niche keywords, last 24h trend cache.
**Sources:** Google Trends (pytrends), Reddit (top posts in niche subreddits), YouTube trending (filtered by category), Nitter RSS for X trends, optional NewsAPI/RSS feeds.
**Output:** raw trend payload stored in `trend_cache`, then passed to step 2.

### Step 2 — Topic selector (Claude)
**Inputs:** raw trends + project's last 30 days of `content_analytics` (what performed well/poorly) + last 7 days of `content_pieces` (avoid duplication).
**Prompt structure:** "Given these trending topics and my niche `{niche}`, select top 3 topics that would get high engagement. Avoid topics covered in last 7 days. Return JSON: `[{topic, angle, target_platform, reasoning}]`."
**Output:** 1-3 topic objects.

### Step 3 — Content generation (parallel)
For each selected topic, run in parallel:

**3a. Script writer (Claude):** Generates platform-specific scripts.
- YouTube: hook → body → CTA, ~60-90s for shorts or 5-10min for long-form
- X: thread of 5-10 numbered tweets OR single punchy post
- Instagram: 30-second reel script OR carousel slide-by-slide content

**3b. Media generator:**
- Thumbnail: Claude writes Flux prompt → Pollinations.ai generates → uploaded to R2
- Video (if needed): Edge TTS generates voiceover → Remotion renders video using script + VO + stock footage / text overlays → uploaded to R2

**3c. SEO + captions (Claude):** Title variants (A/B), description, tags, hashtags optimized per platform.

**Output:** populated `content_pieces` row with status `draft`.

### Step 4 — Quality review agent (Claude)
Separate Claude call that reads everything generated and validates:
- Brand voice match against project's `brand_voice_prompt`
- Factual claims (flag for verification)
- Platform policy compliance (no banned topics)
- Format correctness (length, hashtag count, etc.)

If fails: regenerates the failing component (max 2 retries) → if still fails, marks `status=failed` and notifies user.
If passes: status moves to `pending_approval` (or directly to `approved` if `approval_mode=auto`).

### Step 5 — Approval gate
If `approval_mode=manual`:
- Telegram bot sends message with thumbnail preview, video link (R2 signed URL), script text, scheduled time
- Inline buttons: ✅ Approve / ❌ Reject / ✏️ Request edit
- User response updates `status` accordingly

If `approval_mode=auto`:
- Skip this step
- Send daily digest to Telegram at end of day with summary of what was published

### Step 6 — Publishing
For each platform in `project_platforms` where `enabled=true`:
- **YouTube:** Upload video via Data API v3, set title/description/tags/thumbnail, optionally schedule
- **Instagram:** Upload reel/carousel via Graph API, set caption + hashtags
- **X:** Post via OpenTweet API (single tweet or thread)
- Store returned platform IDs in `content_pieces.platforms_published`
- Status → `published`

### Step 7 — Analytics + learning loop
Runs once daily on a separate cron, 24h after publish:
- Pull engagement metrics from each platform's API
- Store in `content_analytics`
- This data becomes input for step 2 next day → topic selector learns what works

---

## 6. Project structure

```
/
├── PROJECT_SPEC.md              ← this file
├── README.md
├── .env.example
├── .gitignore
│
├── apps/
│   ├── dashboard/               ← Next.js frontend
│   │   ├── app/
│   │   │   ├── (auth)/login/
│   │   │   ├── (app)/projects/
│   │   │   │   ├── new/
│   │   │   │   ├── [id]/
│   │   │   │   │   ├── analytics/
│   │   │   │   │   ├── content/
│   │   │   │   │   └── settings/
│   │   │   │   └── page.tsx     ← project list
│   │   │   ├── api/
│   │   │   │   ├── projects/
│   │   │   │   ├── webhooks/telegram/  ← approval responses
│   │   │   │   └── trigger/[projectId]/ ← manual trigger
│   │   │   └── layout.tsx
│   │   ├── components/
│   │   ├── lib/
│   │   │   └── supabase/
│   │   ├── package.json
│   │   └── next.config.js
│   │
│   └── n8n-workflows/           ← exported n8n workflow JSON files
│       ├── 01-trend-research.json
│       ├── 02-topic-selector.json
│       ├── 03-content-generation.json
│       ├── 04-quality-review.json
│       ├── 05-approval-gate.json
│       ├── 06-publishing-youtube.json
│       ├── 06-publishing-instagram.json
│       ├── 06-publishing-x.json
│       └── 07-analytics-collector.json
│
├── packages/
│   ├── shared/                  ← shared types + utils
│   │   ├── src/
│   │   │   ├── types.ts         ← Project, ContentPiece, etc.
│   │   │   ├── prompts/         ← Claude system prompts per agent
│   │   │   │   ├── topic-selector.ts
│   │   │   │   ├── script-writer.ts
│   │   │   │   ├── quality-review.ts
│   │   │   │   └── seo-captions.ts
│   │   │   └── platforms/       ← platform format specs
│   │   └── package.json
│   │
│   ├── trend-research/          ← Python service (FastAPI) for trend pulling
│   │   ├── main.py
│   │   ├── sources/
│   │   │   ├── google_trends.py
│   │   │   ├── reddit.py
│   │   │   ├── youtube_trending.py
│   │   │   ├── nitter_rss.py
│   │   │   └── newsapi.py
│   │   └── requirements.txt
│   │
│   ├── media-gen/               ← Node service for video/thumbnail generation
│   │   ├── src/
│   │   │   ├── thumbnail.ts     ← Pollinations.ai client
│   │   │   ├── voiceover.ts     ← Edge TTS wrapper
│   │   │   └── video/           ← Remotion templates
│   │   │       ├── TextOverlay.tsx
│   │   │       ├── StockFootage.tsx
│   │   │       └── index.ts
│   │   └── package.json
│   │
│   └── publisher/               ← Node service for platform publishing
│       ├── src/
│       │   ├── youtube.ts
│       │   ├── instagram.ts
│       │   └── x.ts             ← OpenTweet client
│       └── package.json
│
├── infra/
│   ├── supabase/
│   │   └── migrations/          ← SQL migration files
│   ├── n8n/
│   │   └── render.yaml          ← Render Blueprint for n8n deploy
│   └── docker-compose.yml       ← local dev
│
└── scripts/
    ├── seed-db.ts
    └── deploy.sh
```

---

## 7. Required environment variables

```bash
# Anthropic
ANTHROPIC_API_KEY=

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Telegram
TELEGRAM_BOT_TOKEN=
TELEGRAM_DEFAULT_CHAT_ID=

# Platforms
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=
META_ACCESS_TOKEN=
OPENTWEET_API_KEY=

# Trend sources
REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=
NEWSAPI_KEY=                  # optional
APIFY_API_TOKEN=              # for X scraping

# Media
POLLINATIONS_API_KEY=         # optional, free without
REPLICATE_API_TOKEN=          # fallback if Pollinations rate-limited
CLOUDFLARE_R2_ACCESS_KEY=
CLOUDFLARE_R2_SECRET_KEY=
CLOUDFLARE_R2_BUCKET=
CLOUDFLARE_R2_ENDPOINT=

# n8n (for dashboard → n8n communication)
N8N_WEBHOOK_BASE_URL=
N8N_API_KEY=
```

---

## 8. Phased build plan

Build in phases. Don't try to do everything at once. Each phase ends with something that **actually works end-to-end** for a subset of platforms.

### Phase 1 (MVP) — X bot only
**Goal:** User creates a project, configures X posting, system researches trends and posts daily.

- [ ] Set up monorepo (pnpm workspaces or Turborepo)
- [ ] Initialize Supabase project + migrations for projects, project_platforms, content_pieces tables
- [ ] Build Next.js dashboard with auth (Supabase Auth)
- [ ] Build "New Project" form (niche, brand voice, X-only platform)
- [ ] Deploy n8n on Render free tier with cron pinger setup
- [ ] Build n8n workflow #1: trend research (Google Trends + Reddit + Nitter RSS)
- [ ] Build n8n workflow #2: topic selector (Claude API call)
- [ ] Build n8n workflow #3a: X script writer (Claude)
- [ ] Build n8n workflow #4: quality review (Claude)
- [ ] Build n8n workflow #5: Telegram approval bot
- [ ] Build n8n workflow #6c: X publisher via OpenTweet
- [ ] Wire daily cron per project
- [ ] **Ship it. Test end-to-end with one real X account for 1 week.**

### Phase 2 — YouTube long-form pipeline
- [ ] Add YouTube OAuth flow to dashboard
- [ ] Build packages/media-gen with Remotion templates (text-overlay style first)
- [ ] Add Edge TTS voiceover generation
- [ ] Add Pollinations.ai thumbnail generation
- [ ] Wire R2 storage for media uploads
- [ ] Build n8n workflow #3b: video generation pipeline
- [ ] Build n8n workflow #6a: YouTube publisher
- [ ] Test daily YouTube + X output

### Phase 3 — Instagram + polish
- [ ] Add Instagram Graph API integration (requires FB Business account setup docs)
- [ ] Adapt Remotion templates for 9:16 reels
- [ ] Build carousel image generator
- [ ] Build n8n workflow #6b: IG publisher
- [ ] Build analytics dashboard view (charts of views/engagement per project)
- [ ] Build n8n workflow #7: analytics collector (runs 24h after publish)

### Phase 4 — Learning loop + auto-update
- [ ] Wire analytics back into topic selector prompt
- [ ] Add A/B testing for thumbnails (post 2 variants, track CTR)
- [ ] Add weekly review: Claude analyzes performance and suggests brand voice tweaks
- [ ] Add error recovery + dead-letter queue for failed pipelines
- [ ] Add billing dashboard (track Anthropic API spend per project)

---

## 9. Hard rules for the coding agent

1. **Never commit secrets.** Use `.env.example` with placeholder values; real keys go in `.env` (gitignored).
2. **No localStorage/sessionStorage in any artifact.** Use React state or server state only.
3. **All Claude API calls use `claude-sonnet-4-20250514`** unless explicitly overridden.
4. **Cost discipline:** Cache aggressively. Trend research caches for 6h. Quality review only re-runs on failure. Don't loop Claude calls without max retry limits.
5. **Free-tier first:** Default to free alternatives (Edge TTS, Pollinations, Nitter, Render free). Only use paid services where the spec explicitly says so.
6. **Human approval default:** New projects start with `approval_mode='manual'`. Only switch to `auto` after the user explicitly toggles it in the UI with a confirmation modal.
7. **Idempotency:** Every n8n workflow must be safe to retry. Use `content_pieces.id` as idempotency key for publishing.
8. **RLS everywhere:** Every Supabase table accessed from the client must have row-level security enabled.
9. **Type-safe end-to-end:** Use generated Supabase types in TypeScript. Don't `any`.
10. **Don't over-engineer Phase 1.** Get the X bot shipping in 1-2 weeks. YouTube can wait.

---

## 10. Reference: API docs to consult

- Anthropic API: https://docs.claude.com/en/api
- Supabase: https://supabase.com/docs
- n8n self-hosting: https://docs.n8n.io/hosting/
- Render Blueprint: https://render.com/docs/blueprint-spec
- Remotion: https://www.remotion.dev/docs/
- Edge TTS Python: https://github.com/rany2/edge-tts
- Pollinations.ai: https://pollinations.ai/
- OpenTweet: https://opentweet.io/docs
- YouTube Data API v3: https://developers.google.com/youtube/v3
- Instagram Graph API: https://developers.facebook.com/docs/instagram-platform
- Telegram Bot API: https://core.telegram.org/bots/api
- pytrends: https://github.com/GeneralMills/pytrends
- Reddit PRAW: https://praw.readthedocs.io/

---

## 11. Definition of done for Phase 1

When Phase 1 is "done":
- A user can sign up at the dashboard URL
- They can create a project named e.g. "Test AI Channel" with niche keywords and connect their X account via OpenTweet
- The system runs autonomously every day at the configured time
- They receive a Telegram message with a tweet preview, can approve/reject
- Approved tweets get posted to X
- They can see all generated content (approved, rejected, published) in the dashboard
- Total monthly cost for one project running daily: under $20

That's the "real" milestone. Everything before that is scaffolding.