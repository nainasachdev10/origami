# Origami

Autonomous content creation system for X, YouTube, and Instagram. Define your niche once, and the system researches trends, generates scripts, creates media, and publishes daily — all hands-free.

**Phase 1: X Bot — In Progress**

[![GitHub](https://img.shields.io/badge/GitHub-nainasachdev10%2Forigami-black?logo=github)](https://github.com/nainasachdev10/origami)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## What's built (Phase 1)

You now have a complete X (Twitter) publishing pipeline that:

- **Dashboard** (Next.js 14): Create projects, configure brand voice and posting schedule, view all generated content
- **Authentication**: Supabase Auth with email/password
- **Database**: Supabase Postgres with 5 tables and Row-Level Security (RLS) enforced per user
- **Trend Research Service**: Python FastAPI that pulls trends from Google Trends, Reddit, YouTube, and Nitter RSS every 6 hours
- **n8n Orchestration**: Visual workflow pipeline that:
  1. Researches trends daily
  2. Asks Claude to pick the best topic for your niche
  3. Generates platform-specific scripts
  4. Reviews quality against your brand voice
  5. Sends preview to Telegram for approval
  6. Publishes to X
- **Telegram Bot**: Inline keyboard interface to approve/reject content before posting
- **Shared Library**: TypeScript types that match the Supabase schema, plus reusable Claude prompts for all agent tasks

## Architecture

```
[User Dashboard]                          [Notification]
  Next.js on Vercel                          Telegram Bot
        │                                        ▲
        │ creates / manages projects             │ approval previews
        ▼                                        │
  [Supabase Postgres]  ◄──────────  [n8n on Render free tier]
   - projects                            │
   - content_pieces                      │ runs per-project cron
   - content_analytics                   │
   - credentials (encrypted)             ▼
   - trend_cache                  ┌─────────────────────────┐
                                  │  Per-project pipeline   │
                                  │  1. Trend research      │
                                  │  2. Topic selector      │
                                  │  3. Script writing      │
                                  │  4. Quality review      │
                                  │  5. Approval gate       │
                                  │  6. Publish to X        │
                                  └─────────────────────────┘
                                          │
                                          ▼
                                  [Cloudflare R2 / Supabase Storage]
                                   thumbnails, archives
```

## Quick start (local dev)

### 1. Clone and install

```bash
git clone https://github.com/nainasachdev10/origami
cd origami
pnpm install
```

### 2. Set up environment variables

Copy the example and fill in your API keys:

```bash
cp .env.example .env
```

See **Environment Variables** section below for where to get each one.

### 3. Set up Supabase

Create a free Supabase project and run migrations:

```bash
# Option A: Using Supabase CLI (recommended)
supabase login
supabase link --project-ref <your-project-ref>
supabase db push

# Option B: Paste migrations manually into Supabase Dashboard SQL Editor
# See infra/supabase/README.md for details
```

Add these to your `.env`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

For details, see [infra/supabase/README.md](infra/supabase/README.md).

### 4. Run the dashboard locally

```bash
pnpm --filter dashboard dev
```

Open http://localhost:3000. Sign up with any email (dev mode has auto-confirm).

### 5. Run the trend research service (optional)

```bash
cd packages/trend-research
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows
pip install -r requirements.txt
uvicorn main:app --reload
```

The service runs at http://localhost:8000. n8n will call this endpoint to fetch trends.

### 6. Deploy n8n (required for automation)

See [infra/n8n/README.md](infra/n8n/README.md) for one-click Render deployment and workflow setup.

## Deployment

### Step 1: Supabase (database)

Deploy a free Supabase instance and run migrations:

1. Go to [supabase.com](https://supabase.com), create a new project
2. Run migrations: `supabase db push` (see [infra/supabase/README.md](infra/supabase/README.md))
3. Copy your project URL and keys to `.env`

### Step 2: n8n (orchestration pipeline)

Deploy n8n to Render free tier using the Blueprint:

1. See [infra/n8n/README.md](infra/n8n/README.md)
2. One-click deploy or manual Blueprint setup
3. Import the workflow JSONs from `apps/n8n-workflows/`
4. Set up credentials and cron schedules

### Step 3: Trend research service (optional but recommended)

Deploy the Python service as a containerized API. Options:

- **Render**: Similar to n8n, use a Blueprint
- **Railway**: Minimal config, auto-detect `requirements.txt`
- **Fly.io**: `flyctl deploy`
- **Local machine**: Run with `uvicorn main:app --host 0.0.0.0 --port 8000` and expose via ngrok

Set the service URL in your `.env` as `TREND_RESEARCH_SERVICE_URL`.

### Step 4: Dashboard (frontend)

Deploy to Vercel (free tier, unlimited bandwidth):

1. Push your repo to GitHub
2. Go to [vercel.com](https://vercel.com), click **Add New > Project**
3. Select your `origami` repo
4. Fill in all environment variables from your `.env`
5. Click **Deploy**

## Environment variables

| Variable | Type | Where to get it | Used by |
|----------|------|-----------------|---------|
| **Anthropic** | | | |
| `ANTHROPIC_API_KEY` | string | https://console.anthropic.com/keys | n8n, trend-research |
| **Supabase** | | | |
| `NEXT_PUBLIC_SUPABASE_URL` | string | Supabase Dashboard > Settings > API | dashboard, n8n |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | string | Supabase Dashboard > Settings > API | dashboard |
| `SUPABASE_SERVICE_ROLE_KEY` | string | Supabase Dashboard > Settings > API | dashboard (server), n8n, trend-research |
| **Telegram** | | | |
| `TELEGRAM_BOT_TOKEN` | string | @BotFather on Telegram (send `/newbot`) | n8n approval gate |
| `TELEGRAM_DEFAULT_CHAT_ID` | string | Send a message to your bot, then GET `https://api.telegram.org/bot<TOKEN>/getUpdates` → look for `chat.id` | n8n notifications |
| **X / Twitter** | | | |
| `OPENTWEET_API_KEY` | string | https://opentweet.io/pricing ($5.99/mo) | n8n publishing |
| **Trend sources** | | | |
| `REDDIT_CLIENT_ID` | string | https://www.reddit.com/prefs/apps → Create app → personal use script | trend-research |
| `REDDIT_CLIENT_SECRET` | string | Same Reddit app | trend-research |
| **Trend research service** | | | |
| `TREND_RESEARCH_SERVICE_URL` | string | URL where you deployed packages/trend-research | n8n, dashboard |
| **Optional** | | | |
| `NEWSAPI_KEY` | string | https://newsapi.org/ (optional, free tier) | trend-research (if enabled) |
| `APIFY_API_TOKEN` | string | https://apify.com/ (pay-per-event, optional) | trend-research (for X scraping) |

## What you need to get started

To run Phase 1 end-to-end, create these accounts (all have free tiers):

- [ ] **Supabase** — https://supabase.com (free project, unlimited reads/writes within quotas)
- [ ] **Vercel** — https://vercel.com (deploy dashboard for free)
- [ ] **Anthropic API** — https://console.anthropic.com/keys (pay-as-you-go; budget ~$0.20/day with caching)
- [ ] **Telegram Bot** — Message @BotFather on Telegram, send `/newbot`, get your token
- [ ] **Reddit API** — https://www.reddit.com/prefs/apps (create a personal-use app, free)
- [ ] **OpenTweet API** — https://opentweet.io/pricing ($5.99/mo for X posting)
- [ ] **Render** — https://render.com (free tier for n8n + Postgres)
- [ ] **X / Twitter account** — the one you want to post to (already have? set it aside for testing)

**Total Phase 1 monthly cost:** ~$6-20/month (mostly Anthropic API token usage + OpenTweet subscription).

## Phase roadmap

### Phase 1 ✓ (current)
- X bot MVP with manual approval gate
- Daily trend research, topic selection, script writing, quality review
- Telegram approval workflow

### Phase 2 (next)
- YouTube long-form pipeline with Remotion video generation
- Edge TTS voiceover + stock footage / text overlay templates
- Pollinations.ai thumbnail generation

### Phase 3
- Instagram Reels + carousel pipeline
- Analytics dashboard (views, engagement by platform/topic)
- Automated analytics collection via platform APIs

### Phase 4
- Learning loop: analytics feed back into topic selector
- A/B testing for thumbnails
- Weekly performance review and brand voice optimization

## Testing

See [TESTING.md](TESTING.md) for:
- Unit and integration test setup
- How to test the n8n workflows locally
- End-to-end flow test with a real X account (1-week trial)

## Repository structure

```
├── README.md                    ← you are here
├── DECISIONS.md                 ← engineering decision log
├── Project_spec.md              ← full spec
├── .env.example                 ← template
├── pnpm-workspace.yaml          ← monorepo config
│
├── apps/
│   ├── dashboard/               ← Next.js 14 frontend
│   └── n8n-workflows/           ← exported workflow JSONs
│
├── packages/
│   ├── shared/                  ← TypeScript types + prompts
│   ├── trend-research/          ← Python FastAPI service
│   ├── media-gen/               ← video + thumbnail generation
│   ├── publisher/               ← platform publishing clients
│   └── config/                  ← shared config
│
├── infra/
│   ├── supabase/                ← migrations + setup guide
│   └── n8n/                     ← Render Blueprint + deployment
│
└── scripts/
    ├── seed-db.ts               ← seed test data
    └── deploy.sh                ← deployment helper
```

## Contributing

1. Read [Project_spec.md](Project_spec.md) to understand the full architecture
2. Read [DECISIONS.md](DECISIONS.md) to see previous trade-offs
3. Create a branch: `git checkout -b feature/your-feature`
4. Follow the stack decisions in the spec (locked for Phase 1)
5. Open a pull request

## License

MIT © [Naina Sachdev](https://github.com/nainasachdev10)
