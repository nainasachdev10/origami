# n8n Workflows — Phase 1 (X Bot Pipeline)

Seven n8n workflow JSON files that power the Phase 1 autonomous X (Twitter) posting pipeline.

---

## What each workflow does

| File | Description |
|---|---|
| `01-trend-research.json` | Accepts a project ID and niche keywords, calls the trend-research FastAPI service, and returns the raw trend payload. |
| `02-topic-selector.json` | Fetches recent topics from Supabase to avoid duplication, calls Claude to select 1-3 high-engagement topics from the trend data, and returns a JSON array of `{topic, angle, target_platform, reasoning}`. |
| `03-script-writer-x.json` | Takes a single topic and calls Claude to generate a platform-optimised X script (thread array or single string), inserts a `draft` row in `content_pieces`, and returns the new `content_piece_id` and `script`. |
| `04-quality-review.json` | Sends the draft script to Claude for brand-voice, factual, policy, and format checks; patches `content_pieces.status` to `pending_approval` or `failed`; returns `{passed, score, issues}`. |
| `05-approval-telegram.json` | Sends a Markdown preview with Approve / Reject inline buttons to Telegram, then pauses execution at an n8n Wait node until the user taps a button. |
| `06-publish-x.json` | Detects thread vs. single post, calls OpenTweet `/thread` or `/tweet`, then patches `content_pieces` with `status=published`, `published_at`, and the returned tweet ID in `platforms_published`. |
| `master-pipeline.json` | Scheduled orchestrator that runs every day at 10:00 UTC: fetches active projects, runs workflows 01–06 per project per topic, and routes through the quality/approval/publish decision tree. |

---

## Import order

Import in this exact sequence so sub-workflow IDs exist before the master pipeline is configured:

1. `01-trend-research.json`
2. `02-topic-selector.json`
3. `03-script-writer-x.json`
4. `04-quality-review.json`
5. `05-approval-telegram.json`
6. `06-publish-x.json`
7. `master-pipeline.json`

To import: n8n UI → Workflows → Import from file → select the JSON.

---

## After import: update Execute Workflow node IDs in master-pipeline

The master pipeline ships with placeholder strings that must be replaced with real n8n workflow IDs after import. Open `master-pipeline` in the n8n editor and update the `workflowId` value in each Execute Workflow node:

| Node name | Placeholder | Replace with |
|---|---|---|
| Execute Workflow - Trend Research | `REPLACE_WITH_01_ID` | ID of imported `01-trend-research` |
| Execute Workflow - Topic Selector | `REPLACE_WITH_02_ID` | ID of imported `02-topic-selector` |
| Execute Workflow - Script Writer X | `REPLACE_WITH_03_ID` | ID of imported `03-script-writer-x` |
| Execute Workflow - Quality Review | `REPLACE_WITH_04_ID` | ID of imported `04-quality-review` |
| Execute Workflow - Telegram Approval | `REPLACE_WITH_05_ID` | ID of imported `05-approval-telegram` |
| Execute Workflow - Publish X | `REPLACE_WITH_06_ID` | ID of imported `06-publish-x` |

The workflow ID appears in the browser URL when you open a workflow: `https://<your-n8n>/workflow/<ID>`.

---

## Required environment variables

Set these in Render (service → Settings → Environment) before activating any workflow:

```
# LLM
ANTHROPIC_API_KEY=

# Supabase
NEXT_PUBLIC_SUPABASE_URL=        # e.g. https://xyzxyz.supabase.co
SUPABASE_SERVICE_ROLE_KEY=       # service role key, not anon key

# Telegram
TELEGRAM_BOT_TOKEN=              # from @BotFather
TELEGRAM_DEFAULT_CHAT_ID=        # your personal or group chat ID

# OpenTweet (X publishing)
OPENTWEET_BASE_URL=              # e.g. https://api.opentweet.io/v1
OPENTWEET_API_KEY=

# Trend research FastAPI service
TREND_RESEARCH_URL=              # e.g. https://trend-research.onrender.com
```

---

## Testing: manually trigger 01-trend-research

1. Open `01-trend-research` in the n8n editor.
2. Click **Execute workflow** (top right).
3. In the Webhook trigger node, click **Listen for test event**.
4. Send a POST request to the displayed test URL:

```bash
curl -X POST https://<your-n8n>/webhook-test/trend-research \
  -H "Content-Type: application/json" \
  -d '{"project_id": "test-project-123", "niche_keywords": ["AI", "LLMs", "tech news"]}'
```

5. Verify the execution log shows a successful HTTP call to `$TREND_RESEARCH_URL/research` and that the Set node outputs `project_id`, `trend_data`, and `niche_keywords`.

Once 01 passes, run 02 through 06 individually in the same way, chaining outputs as inputs, before activating the master pipeline.

---

## Telegram approval callback wiring

`05-approval-telegram` uses an n8n Wait node (resume type: webhook). When the user taps Approve or Reject in Telegram, the bot must forward the `callback_query` to the Wait node's resume URL.

Configure your Telegram bot webhook to point to the dashboard route `/api/webhooks/telegram`. That route must:

1. Call `answerCallbackQuery` to dismiss the Telegram spinner.
2. Extract `callback_data` (`approve:<content_piece_id>` or `reject:<content_piece_id>`).
3. POST to `https://<your-n8n>/webhook/approval-resume` with body `{ "callback_data": "<value>", "callback_query": { "data": "<value>" } }`.

The Wait node's `webhookSuffix` is set to `/approval-resume`, which matches this path.
