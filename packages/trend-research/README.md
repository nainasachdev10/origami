# Trend Research Service

FastAPI service that aggregates trends from Google Trends, Reddit, YouTube, and Nitter (X). Cached for 6 hours in Supabase `trend_cache`.

## Endpoints

- `POST /research` — body `{ "niche_keywords": ["AI", "LLMs"] }` → returns merged trends
- `GET /health` — readiness probe

## Deploy to Render (free tier)

1. **Push the repo to GitHub** (Render reads from Git).
2. In Render dashboard → **New → Blueprint**, point at this repo.
3. Render auto-detects `packages/trend-research/render.yaml`. Service name: `origami-trend-research`.
4. Set the env vars marked `sync: false` in the Render UI:
   - `NEXT_PUBLIC_SUPABASE_URL` — same as your dashboard/n8n
   - `SUPABASE_SERVICE_ROLE_KEY` — same
   - `YOUTUBE_API_KEY` — Google Cloud Console → YouTube Data API v3
   - `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` — optional, source skipped if absent
   - `NEWSAPI_KEY` — optional
5. Deploy. Wait for the health check at `/health` to pass.
6. Copy the public URL (e.g. `https://origami-trend-research.onrender.com`).
7. **In your n8n service env vars**, set `TREND_RESEARCH_URL` to that URL.

## Free-tier note

Render free web services sleep after 15 min idle. The `01-trend-research.json` n8n workflow has a 60-second timeout, which should be enough for the cold start. If you see timeouts, set up a cron-job.org pinger to `GET /health` every 10 minutes.

## Local dev

```bash
cd packages/trend-research
cp .env.example .env  # fill in values
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Test:
```bash
curl -X POST http://localhost:8000/research \
  -H 'Content-Type: application/json' \
  -d '{"niche_keywords":["AI","LLMs"]}'
```
