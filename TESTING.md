# Testing Guide — Origami Phase 1

## Overview

This document covers two levels of testing for the Phase 1 pipeline (X/Twitter posting only):

1. **Automated E2E test script** — runs against real Supabase, mocks all external APIs (n8n, Telegram, OpenTweet). No paid credentials required beyond Supabase.
2. **Manual live pipeline checklist** — step-by-step walkthrough to validate the fully wired system with real accounts.

---

## Prerequisites

- Node 18 or higher
- pnpm installed globally (`npm install -g pnpm`)
- A Supabase project created at https://supabase.com
- All migrations applied to that Supabase project (see `infra/supabase/migrations/`)
- A `.env` file at the repo root containing at minimum:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-id>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

The service role key is found at: **Supabase Dashboard > Settings > API > service_role secret**. It bypasses Row-Level Security and must never be committed or exposed to the browser.

---

## Running the Automated E2E Test

### Setup

```bash
cd /path/to/origami

# Copy the example env file and fill in your Supabase credentials
cp .env.example .env
# Edit .env — set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY

# Install dependencies (monorepo root + scripts package)
pnpm install
```

### Execute

```bash
pnpm --filter scripts test:e2e
```

This runs `scripts/test-e2e-x.ts` via `tsx` (TypeScript execution, no compile step needed).

### What the script tests

The script walks the Phase 1 pipeline end-to-end, using real Supabase DB writes at every step:

| Step | What happens |
|------|-------------|
| 1 | Reads env vars, creates typed Supabase client with service-role key |
| 2 | INSERTs a project row (`name="E2E Test - AI Tools"`, `approval_mode=manual`, `content_style=thread`) |
| 3 | INSERTs a `project_platforms` row linking that project to platform `x` with handle `@test_account` |
| 4 | INSERTs a `content_pieces` row simulating what the n8n pipeline would produce — a 5-tweet thread, `status=pending_approval` |
| 5 | SELECTs the content piece and asserts `status=pending_approval` and `script` is non-null |
| 6 | Prints a formatted preview of the Telegram approval message (topic, thread tweets, caption, hashtags, and the three inline button labels) |
| 7 | UPDATEs `content_pieces.status` to `approved`, simulating the user tapping the Approve button |
| 8 | SELECTs again and asserts `status=approved` |
| 9 | DELETEs all created rows in FK-safe order: content_pieces → project_platforms → projects |
| 10 | Prints a final summary table |

If any step throws, the script still runs cleanup before exiting with code 1.

### What the script skips (external APIs)

The following are intentionally mocked or omitted because they require live credentials or paid plans:

- **n8n** — the pipeline trigger is replaced by a direct DB insert
- **Telegram Bot API** — the approval message is printed to stdout, not sent
- **OpenTweet / X posting** — no tweet is actually posted
- **Claude API (Anthropic)** — topic selection and script generation are skipped; the script text is hardcoded
- **Google Trends, Reddit, Nitter RSS** — trend research is not executed
- **Cloudflare R2 / Supabase Storage** — no media files are uploaded

### What the script verifies

- Supabase schema accepts all required fields for `projects`, `project_platforms`, and `content_pieces`
- The `status` state machine works: a row can be created as `pending_approval` and updated to `approved`
- FK constraints are correct (cascade delete from projects cleans up related rows)
- The `script` field stores a JSON-serialised array of tweet strings
- Cleanup leaves no orphaned test rows in the database

---

## Manual Testing Checklist — Full Live Pipeline

Follow these steps sequentially to validate Phase 1 with real credentials and a real X account.

### Infrastructure Setup

1. **Create a Supabase project**
   - Sign up at https://supabase.com and create a new project
   - Navigate to **SQL Editor** and run all files in `infra/supabase/migrations/` in filename order
   - Confirm all five tables exist: `projects`, `project_platforms`, `content_pieces`, `content_analytics`, `trend_cache`

2. **Deploy n8n to Render**
   - Go to https://render.com, create a new Blueprint deployment
   - Point it at `infra/n8n/render.yaml` in this repo
   - Wait for the service to show "Live"
   - Note the deployed URL (e.g. `https://origami-n8n.onrender.com`)

3. **Import n8n workflows in order**
   - Open the n8n UI at your Render URL
   - Import each JSON file from `apps/n8n-workflows/` in numeric order:
     - `01-trend-research.json`
     - `02-topic-selector.json`
     - `03-content-generation.json`
     - `04-quality-review.json`
     - `05-approval-gate.json`
     - `06-publishing-x.json`
     - `master-pipeline.json` (wires 01-06 together)
   - Activate all workflows

4. **Set environment variables in Render dashboard**
   - In your Render service settings, add all variables from `.env.example` that are used by n8n:
     `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `N8N_API_KEY`, and all platform keys listed below

### Telegram Bot Setup

5. **Create a Telegram bot via BotFather**
   - Open Telegram, search for `@BotFather`
   - Send `/newbot`, follow prompts, receive your `TELEGRAM_BOT_TOKEN`
   - Send `/start` to your new bot to initialise the chat

6. **Find your chat ID**
   - Send a message to your bot
   - Visit `https://api.telegram.org/bot<TOKEN>/getUpdates`
   - Copy the `chat.id` value from the response

7. **Set Telegram env vars** in Render:
   ```
   TELEGRAM_BOT_TOKEN=<token from BotFather>
   TELEGRAM_DEFAULT_CHAT_ID=<your chat id>
   ```

### X (Twitter) Setup

8. **Get an OpenTweet API key**
   - Sign up at https://opentweet.io
   - Follow the account-connection flow to link your X account
   - Copy your API key from the dashboard

9. **Set the env var** in Render:
   ```
   OPENTWEET_API_KEY=<your key>
   ```

### Reddit API Setup (for trend research)

10. **Create a Reddit read-only app**
    - Go to https://www.reddit.com/prefs/apps and create a new "script" app
    - Copy the client ID (under the app name) and secret

11. **Set the env vars** in Render:
    ```
    REDDIT_CLIENT_ID=<client id>
    REDDIT_CLIENT_SECRET=<client secret>
    ```

### Dashboard Deployment

12. **Deploy the dashboard to Vercel**
    - Connect your GitHub repo to Vercel
    - Set the root directory to `apps/dashboard`
    - Add all `NEXT_PUBLIC_*` variables in the Vercel project settings:
      ```
      NEXT_PUBLIC_SUPABASE_URL=
      NEXT_PUBLIC_SUPABASE_ANON_KEY=
      ```

### End-to-End Flow Validation

13. **Sign up at the dashboard**
    - Open your Vercel deployment URL
    - Create an account using Supabase Auth (email/password or magic link)

14. **Create a project with X platform**
    - Click "New Project"
    - Fill in: name, niche keywords (e.g. `AI, machine learning`), brand voice prompt, select content style "Thread"
    - Add X platform, enter your `@handle`
    - Set approval mode to "Manual"
    - Save

15. **Trigger the pipeline manually**
    - In n8n, open the `master-pipeline` workflow
    - Click "Execute Workflow" and pass `{ "project_id": "<your project id>" }` as the input payload
    - Watch the execution log for any errors

16. **Check Telegram for the approval message**
    - Within a few minutes (depending on Claude API response time) you should receive a message in Telegram
    - The message should contain: topic, thread preview (5 tweets), caption, hashtags, and three inline buttons

17. **Approve the content**
    - Tap the "Approve" button in Telegram
    - The n8n approval-gate workflow should receive the callback and update `content_pieces.status` to `approved`

18. **Verify the tweet was posted to X**
    - The publishing workflow should fire after approval
    - Check your X account for the new tweet thread
    - Confirm `content_pieces.platforms_published` contains an X post ID in Supabase

19. **Check the dashboard content tab**
    - Open your project in the dashboard
    - Navigate to the Content tab
    - Confirm the content piece shows `status=published`
    - Confirm the platform ID is displayed

---

## Known Limitations of the Automated E2E Test

The `scripts/test-e2e-x.ts` script validates the DB layer and state machine but cannot test the following without live credentials:

| Component | Why not tested |
|-----------|---------------|
| n8n workflow execution | Requires a running n8n instance with API key and all sub-workflows imported |
| Claude API (topic selector, script writer, quality review) | Requires `ANTHROPIC_API_KEY`; token cost per run |
| Telegram message delivery | Requires `TELEGRAM_BOT_TOKEN` and `TELEGRAM_DEFAULT_CHAT_ID` |
| Telegram inline button callbacks | Requires a real Telegram user interaction |
| X posting via OpenTweet | Requires `OPENTWEET_API_KEY` and a linked X account |
| Trend research sources | Requires Reddit credentials and network access to Google Trends / Nitter |
| Media upload to Cloudflare R2 | Requires `CLOUDFLARE_R2_*` credentials; no media is generated in Phase 1 X-only path |
| Row-Level Security enforcement | Script uses service-role key which bypasses RLS; test with anon key separately to validate RLS policies |

These are all covered by the manual checklist above. The automated test is intentionally scoped to DB correctness and state-machine logic so it can run in CI without any paid-service credentials.

---

## Running in CI (Optional)

To add the E2E test to a CI pipeline (e.g. GitHub Actions), inject the Supabase variables as secrets and add this step:

```yaml
- name: Run E2E test
  env:
    NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
    SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
  run: pnpm --filter scripts test:e2e
```

Use a dedicated Supabase project for CI (separate from production) to avoid test data appearing in real dashboards.
