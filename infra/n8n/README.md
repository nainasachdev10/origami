# n8n on Render — Deployment Guide

This directory contains the [Render Blueprint](https://render.com/docs/blueprint-spec) for deploying n8n to Render's free tier, backed by a free Postgres database.

---

## 1. Deploy to Render

### One-click

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/your-org/origami)

> Update the URL above with your actual GitHub repo URL before sharing.

### Manual (Blueprint)

1. Push this repo to GitHub (or fork it).
2. In [Render Dashboard](https://dashboard.render.com), click **New > Blueprint**.
3. Connect your GitHub account and select this repo.
4. Render will detect `infra/n8n/render.yaml` automatically. If it does not, set the **Blueprint file path** to `infra/n8n/render.yaml`.
5. Click **Apply** — Render will provision `origami-n8n` (web service) and `origami-n8n-db` (Postgres) together.
6. Fill in the **sync: false** environment variables when prompted (see the table in section 3 below).

---

## 2. Prevent Free-Tier Sleep

Render's free web services spin down after 15 minutes of inactivity. n8n crons will miss their schedule if the instance is asleep.

**Fix: ping `/healthz` every 14 minutes via [cron-job.org](https://cron-job.org) (free).**

1. Sign up at [cron-job.org](https://cron-job.org).
2. Click **Create cronjob**.
3. Set the URL to:
   ```
   https://your-n8n-url.onrender.com/healthz
   ```
   Replace `your-n8n-url` with the actual Render-assigned subdomain shown in your service dashboard.
4. Set the schedule to **every 14 minutes** (expression: `*/14 * * * *`).
5. Save. The free tier allows up to 5 jobs; this uses one.

> The `/healthz` endpoint is built into n8n and returns `200 OK` without touching the database, so it is very cheap to call.

---

## 3. First-Time n8n Setup

After the deploy turns green:

1. Open `https://your-n8n-url.onrender.com` in your browser.
2. Log in with the **N8N_BASIC_AUTH_USER** and **N8N_BASIC_AUTH_PASSWORD** you set during deploy.
3. Complete the n8n owner-account registration (email + password for the n8n UI itself — separate from basic auth).
4. Go to **Settings > Credentials** and create the following credential entries:

| Credential name (use exactly) | Type | Values needed |
|---|---|---|
| `Anthropic API` | HTTP Header Auth | Header: `x-api-key`, Value: your `ANTHROPIC_API_KEY` |
| `Telegram Bot` | Telegram API | Bot token from `@BotFather` |
| `OpenTweet` | HTTP Header Auth | Header: `Authorization`, Value: `Bearer <OPENTWEET_API_KEY>` |
| `Supabase REST` | HTTP Header Auth | Header: `apikey`, Value: `SUPABASE_SERVICE_ROLE_KEY` |

> n8n accesses Supabase via its PostgREST HTTP API, not via the native n8n Supabase node (which requires a different auth flow). The HTTP Header Auth credential is the right choice here — see section 6 for details.

---

## 4. Import Workflows

> ⚠️ **Required first**: set `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` in the n8n service env vars (Render → service → Environment). Without this, every node that uses `{{ $env.X }}` fails with **"access to env vars denied"**. Already in `render.yaml`; if you deployed before this was added, set it manually and restart the service.

Import in the numbered order below so that sub-workflow references resolve correctly.

1. In n8n, go to **Settings > Import workflow** (or use the **+** button on the Workflows page and select **Import from file**).
2. Upload each JSON file from `apps/n8n-workflows/` in this order:

```
01-trend-research.json
02-topic-selector.json
03-script-writer-x.json
04-quality-review.json
05-approval-telegram.json
06-publish-x.json
master-pipeline.json        ← import last
```

3. After each import, n8n will open the workflow editor. Click **Save** (top-right) before closing.
4. Do **not** activate any workflow until all imports are complete and credentials are attached.

---

## 5. Per-Project Cron Schedule

The `master-pipeline.json` workflow contains a **Schedule Trigger** node that drives the daily pipeline.

After importing:

1. Open `master-pipeline` in the editor.
2. Click the **Schedule Trigger** node.
3. Set the **Cron Expression** to match the `posting_schedule.cron` field of your first active project (e.g., `0 10 * * *` for 10:00 AM daily).
4. For **multiple projects running on different schedules**, duplicate the master-pipeline workflow once per project and set each copy's Schedule Trigger independently. Pass the `project_id` as a static value in a **Set** node immediately after the trigger.
5. Click **Activate** (toggle in the top-right) on each workflow you want live.

### Manual trigger from the dashboard

The `master-pipeline` also has a **Webhook Trigger** node at path `/webhook/trigger-pipeline`. The dashboard route `POST /api/trigger/[projectId]` calls this webhook so you can fire the pipeline for a single project without waiting for cron.

Set these env vars in **Vercel** (the dashboard):

| Var | Value |
|---|---|
| `N8N_WEBHOOK_BASE_URL` | `https://origami-n8n.onrender.com` (your n8n URL, no trailing slash) |
| `N8N_API_KEY` | optional — only if you protect the webhook |

The webhook URL n8n exposes is: `<N8N_WEBHOOK_BASE_URL>/webhook/trigger-pipeline`. Activate the master-pipeline workflow first so the webhook becomes live.

---

## 6. Connecting Supabase

n8n communicates with Supabase through the **PostgREST REST API** (not the native n8n Supabase node, which uses a different connection method that is harder to configure in a self-hosted environment).

### How it works

Every Supabase project exposes a REST API at:
```
https://<project-ref>.supabase.co/rest/v1/<table>
```

n8n workflows use the **HTTP Request** node to call these endpoints, passing two headers:

| Header | Value |
|---|---|
| `apikey` | `SUPABASE_SERVICE_ROLE_KEY` |
| `Authorization` | `Bearer <SUPABASE_SERVICE_ROLE_KEY>` |

The service role key bypasses Row Level Security, which is intentional here because n8n acts as a trusted backend service — not as an end user.

### Required Render environment variables

Set these in your Render service's **Environment** tab (they are marked `sync: false` in `render.yaml`, meaning Render will prompt for them but not expose them in the YAML):

| Variable | Where to get it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard > Settings > API > Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard > Settings > API > service_role key |

> Keep `SUPABASE_SERVICE_ROLE_KEY` secret. Never commit it to git or expose it client-side. The `NEXT_PUBLIC_` prefix on the URL is harmless — the URL is not sensitive.
