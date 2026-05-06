# Engineering Decisions — Phase 1

This document records all architectural and implementation decisions made during Phase 1 development, particularly those that deviate from or extend the spec.

## 1. pnpm workspaces over npm/yarn

**Decision:** Use `pnpm-workspace.yaml` instead of the `workspaces` field in `package.json`.

**Rationale:** pnpm v9 and later require an explicit `pnpm-workspace.yaml` file for monorepo support. The spec didn't specify this, but we chose pnpm for its speed, disk efficiency, and strict dependency isolation (no phantom dependencies).

**Impact:** Minimal. Developers must use `pnpm` instead of `npm` or `yarn`. Install with `npm install -g pnpm`.

**Reverse:** If you need to switch to npm workspaces, delete `pnpm-workspace.yaml` and add a `workspaces` array to the root `package.json`. No code changes required.

---

## 2. trend_cache RLS: enabled but no explicit policy

**Decision:** Enable RLS on `trend_cache` but create no explicit policy (rely on service role bypass).

**Rationale:** `trend_cache` is read by the n8n service (which uses the service role key, which automatically bypasses RLS) and never by the dashboard client. Writing an explicit policy like `create policy "anyone can read trends" on trend_cache for select using (true)` is unnecessary and slightly riskier — it might accidentally grant anon access if someone misconfigures the service role later. By leaving it empty, we rely on the fact that the service role always bypasses RLS, which is a Supabase guarantee.

**Impact:** Zero. The service role bypasses RLS automatically.

**Risk:** If someone removes the service role key from n8n (by mistake), trend research stops. But that's a configuration error, not a schema problem.

**Reverse:** If you want to be more explicit, add this policy:

```sql
create policy "service role can read trends" on trend_cache
  for select
  using (auth.role() = 'service_role');
```

---

## 3. TypeScript types are hand-written, not auto-generated

**Decision:** Types in `packages/shared/src/types.ts` are written by hand, not generated via `supabase gen types`.

**Rationale:** The `supabase gen types` command requires a live Supabase project. During early development, we can't guarantee every developer has one linked locally. Hand-writing types ensures we can develop without a live project (e.g., testing locally with Docker).

Our hand-written types exactly mirror the SQL schema in `infra/supabase/migrations/001_initial_schema.sql`. They are correct as of the current schema version.

**Impact:** Low. Types won't auto-sync if the schema changes. Developers must manually update both `001_initial_schema.sql` AND `packages/shared/src/types.ts` when adding/removing columns.

**Reverse:** Once you have a live Supabase project, regenerate types:

```bash
supabase gen types typescript \
  --project-id <your-project-ref> \
  --schema public \
  > packages/shared/src/types.ts
```

Then switch to auto-generation in CI or in your pre-commit hooks.

---

## 4. YouTube API key separate from OAuth credentials

**Decision:** Use two different YouTube credential sets:
- **YOUTUBE_API_KEY**: Simple data API key (public, no auth required). Used by trend-research to fetch trending videos.
- **YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET**: OAuth flow. Used by n8n to upload videos and manage channel settings (Phase 2+).

**Rationale:** These are two different use cases with different auth models. Trend research only reads public data (trending videos), which doesn't require OAuth. Publishing requires account access, which does. Splitting them avoids forcing OAuth setup during Phase 1 (when YouTube is only used for trend research).

**Impact:** Slight complexity: two different sets of credentials. But this is cleaner than forcing OAuth for a read-only operation.

**Reverse:** In Phase 2, when we build YouTube publishing, we'll add the OAuth credentials. The API key will remain for trend research.

---

## 5. Telegram Wait node uses webhook resume

**Decision:** The n8n **Wait** node (in `05-approval-gate.json`) resumes via a webhook callback from the Next.js dashboard.

**Rationale:** n8n's Wait node can pause a workflow and resume either:
1. After a fixed delay (e.g., 60 seconds)
2. When it receives a webhook callback

Option 1 is too inflexible (user could approve in 10 seconds, but we wait 60). Option 2 (webhook callback) is dynamic: the dashboard calls the n8n resume URL immediately when the user approves/rejects.

The flow is:
1. n8n sends Telegram message with approval buttons
2. Telegram bot stores the workflow ID + message data in the message callback URL
3. User taps ✅ Approve (or ❌ Reject)
4. Dashboard webhook handler calls n8n's resume URL with the user's decision
5. n8n Wait node resumes immediately with the decision, and the workflow continues

**Impact:** Requires dashboard webhook route `/api/webhooks/telegram` to call n8n's webhook resume endpoint. Already implemented.

**Reverse:** If you want simpler polling (no webhook), change the Wait node to "time" mode and have a separate poller check the database every 30 seconds. Not as responsive, but simpler.

---

## 6. E2E test uses fixed test user UUID (service role bypass)

**Decision:** The test script (`scripts/seed-db.ts`) uses a fixed UUID (`00000000-0000-0000-0000-000000000001`) as a fake user ID and the service role key to bypass auth.

**Rationale:** Real Supabase auth requires email verification, which is hard to automate in tests. By using the service role key, we bypass row-level security entirely and can insert test data as any user ID we choose. The fixed UUID is deterministic, so tests are reproducible.

**Important:** RLS is still tested because the service role respects foreign key constraints. If a test tries to insert invalid data, Postgres will reject it.

**Impact:** Tests don't verify real auth flow (that's manual testing). But they do verify the database schema and RLS constraints are sound.

**Code location:** `scripts/seed-db.ts` uses `SUPABASE_SERVICE_ROLE_KEY` to create a Supabase client that bypasses auth.

**Reverse:** For production testing, use a real test user with email verification disabled (available in Supabase Pro tier). For now, manual testing with real accounts is sufficient.

---

## 7. master-pipeline Execute Workflow IDs are placeholders

**Decision:** The `master-pipeline.json` workflow contains placeholder strings like `"REPLACE_WITH_TREND_RESEARCH_ID"` in Execute Workflow nodes.

**Rationale:** n8n assigns workflow IDs only after importing them into the instance. The master-pipeline imports last and references the other workflows, but it can't know their IDs until they're created. So we use placeholder strings that must be filled in after import.

**Impact:** Extra setup step: after importing all workflows into n8n, open `master-pipeline`, find each Execute Workflow node, click it, and replace the placeholder with the actual workflow ID of the referenced workflow.

For example:
- Execute Workflow node: "Trend Research"
- Find the ID of the `01-trend-research.json` workflow in n8n (shown in the workflow list)
- Replace `"REPLACE_WITH_TREND_RESEARCH_ID"` with that ID (e.g., `"abc123def456"`)

**Reverse:** This could be automated via a post-import script that reads the n8n API and updates the master-pipeline. For now, manual replacement is acceptable (one-time setup).

**See:** [infra/n8n/README.md](infra/n8n/README.md) section 4 for detailed workflow import instructions.

---

## 8. OpenTweet base URL as environment variable

**Decision:** The OpenTweet API base URL is configurable via `OPENTWEET_BASE_URL` env var, not hardcoded.

**Rationale:** OpenTweet is a third-party service. If they update their API endpoint (e.g., from `v1` to `v2`), we don't want to redeploy code. Making the URL configurable means an env var change is enough.

**Default:** If not set, the code defaults to `https://api.opentweet.io` (the current endpoint).

**Impact:** Minimal. Just another env var in `.env` and `.env.example`.

**Reverse:** If you want to hardcode it, replace all references to the env var with the literal URL in the n8n workflow or the publisher service.

---

## 9. Shared prompts as TypeScript exports (not JSON files)

**Decision:** Claude system prompts (topic selector, script writer, quality review, SEO captions) are defined in TypeScript modules in `packages/shared/src/prompts/`, not as JSON or YAML files.

**Rationale:** Prompts are code. They contain dynamic template variables (injected at runtime with niche keywords, analytics data, etc.). TypeScript allows us to export functions that build prompts with type-safe parameters, version them alongside code, and test them easily.

**Impact:** All prompts live in TypeScript and are imported by n8n workflows (via HTTP endpoints that invoke the TypeScript) and by the Python trend-research service (via API endpoints). Changes to prompts are code changes and require deployment.

**Example:** `topic-selector.ts` exports a function:

```typescript
export function buildTopicSelectorPrompt(
  niche: string,
  recentAnalytics: ContentAnalytics[],
  recentTopics: string[]
): string {
  return `You are a content strategist. Given the niche "${niche}", recent performance data, and topics we've covered, select the next topic...`;
}
```

**Reverse:** If you want hot-reloadable prompts, move them to a database table and have the API read them at runtime. Trade-off: added complexity, but no deployments for prompt tweaks.

---

## 10. Content status enum as text, not integer

**Decision:** The `content_pieces.status` column is `text` (values: `draft`, `pending_approval`, `approved`, `rejected`, `published`, `failed`), not an integer with a separate enum table.

**Rationale:** Text is more readable in logs and easier to debug. Postgres text enums exist but require migration to change, and we're still iterating on the status flow in Phase 1. Text gives us flexibility.

**Impact:** Slightly larger column storage (one word vs. one integer), but negligible. Queries comparing status are still O(1).

**Risk:** Typos in status strings are possible (e.g., `publshed` instead of `published`). Mitigate with type-safe helpers in the application layer.

**Reverse:** If you want enum safety, create a Postgres ENUM type:

```sql
CREATE TYPE content_status AS ENUM ('draft', 'pending_approval', 'approved', 'rejected', 'published', 'failed');
ALTER TABLE content_pieces ALTER COLUMN status TYPE content_status USING status::content_status;
```

This prevents invalid values at the database level.

---

## 11. Cron schedule stored as JSONB (not separate table)

**Decision:** The `projects.posting_schedule` column is JSONB containing `{ "cron": "0 10 * * *", "timezone": "Asia/Kolkata" }`, not split into separate columns or a schedule table.

**Rationale:** Each project needs only one schedule (no multiple schedules per project yet). JSONB is flexible: if we later add multiple triggers per project, we just expand the structure. A separate table would be overkill.

**Impact:** Queries that filter by schedule (e.g., "which projects should run now?") need to parse the JSONB. n8n handles this via the HTTP API.

**Example query:**

```sql
SELECT * FROM projects
WHERE active = true
AND (posting_schedule->>'cron')::text ~ '0 10 * * *';
```

**Reverse:** If schedules become complex (multiple crons, exclusion dates, etc.), move to a separate `project_schedules` table and join on `project_id`.

---

## 12. Credentials encrypted in JSONB (not separate credentials table)

**Decision:** The `project_platforms.credentials_encrypted` column stores platform credentials (e.g., X API keys) as encrypted JSONB on each platform row.

**Rationale:** Simpler than a separate credentials table. Each project-platform pair needs exactly one set of credentials. Encryption happens at the application layer (via Supabase's built-in encryption or a secrets manager).

**Important:** The `.env.example` shows this as a placeholder. Real implementation requires:
1. Either use Supabase's built-in field-level encryption (call `pgsodium.crypto_secretbox_keygen()` for the key)
2. Or send credentials to a secrets manager (e.g., Clerk, AWS Secrets Manager) and store only the reference in the database

For Phase 1, credentials are stored in Supabase (encrypted at rest). Phase 2+ should move to a proper secrets manager.

**Impact:** Credentials stay in the database, encrypted. No external API calls on every auth.

**Reverse:** Use a secrets manager (Clerk, AWS Secrets Manager, Vault) and store only a secret ID in the database.

---

## 13. Analytics fetched asynchronously (not in real-time)

**Decision:** The `content_analytics` table is populated by a separate n8n workflow (`07-analytics-collector.json`) that runs once daily, 24 hours after publish. Not in real-time.

**Rationale:** Platform APIs rate-limit analytics queries heavily. Hitting YouTube/Instagram every hour would burn quota. Once-daily is sufficient for trend research (which feeds back into next day's topic selection) and enough for the user to see results.

**Impact:** Analytics are never live (latest is always 24h old). This is acceptable for a daily content pipeline.

**Reverse:** For real-time analytics, call the platform APIs directly in a dashboard widget and cache for 1 hour. Trade-off: more API quota usage.

---

## 14. Content pieces are atomic, status drives workflow

**Decision:** Each `content_piece` row is immutable (no updates after creation). Workflow progress is tracked via the `status` field. If a quality check fails, we regenerate (create a new row) rather than update the existing one.

**Rationale:** Immutable rows are easier to audit and debug. `status` is the single source of truth for where a piece is in the pipeline. If we allowed in-place updates, we'd lose the history of what was tried.

**Impact:** More rows created (one per attempt). But Postgres is efficient, and we clean up old drafts regularly.

**Reverse:** Use a single row per piece and add an `attempts` counter + `last_error` column to track failures. Trade-off: loses history of attempts.

---

## 15. n8n workflows are version-controlled as JSON

**Decision:** All n8n workflows are exported as JSON files in `apps/n8n-workflows/` and version-controlled in git.

**Rationale:** Workflows are code. Keeping them in git allows code review, history, and collaboration. Changes to workflows are tracked alongside schema/app changes.

**Process:**
1. Edit a workflow in n8n UI
2. Export as JSON: n8n menu > **Export workflow**
3. Commit to git
4. On redeploy, reimport the JSON (or use the n8n API to bulk import)

**Impact:** Manual export-import process. Could be automated with n8n CLI, but not necessary for Phase 1.

**Reverse:** Store workflow definitions in n8n only (cloud-sync). Trade-off: harder to code review, but simpler deployment.

---

## 16. Switched LLM from Anthropic Claude to Google Gemini for Phase 1

**Decision:** Use `gemini-1.5-flash` via Google's Generative Language API instead of `claude-sonnet-4-20250514`.

**Why:** Google Gemini offers a free tier (15 RPM, 1M tokens/day, no credit card) that's sufficient for Phase 1 testing and MVP launch. Anthropic requires payment from the first call.

**Trade-offs:**
- Zero cost for Phase 1 testing and MVP
- Generous free tier (15 RPM, 1M tokens/day)
- Lower quality than Claude Sonnet for nuanced creative writing
- More variable JSON output (Gemini sometimes wraps JSON in markdown code blocks)

**How to reverse:** Replace Gemini URLs with `https://api.anthropic.com/v1/messages`, change request body back to Anthropic format (`model`, `max_tokens`, `messages` fields), update env var to `ANTHROPIC_API_KEY`. The system prompts (in `packages/shared/src/prompts/`) work with both providers without modification.

**When to switch back:** When ready to ship to real users, or if Gemini hits rate limits, or if quality issues emerge in topic selection / script writing.

---

## Summary of design trade-offs

| Component | Decision | Trade-off |
|-----------|----------|-----------|
| Monorepo | pnpm workspaces | Requires pnpm; faster than npm |
| Database | Supabase (free tier) | Low quota; free is enough for MVP |
| Types | Hand-written | Must update manually; not auto-generated |
| YouTube auth | API key + OAuth | Two credentials; simpler auth for trends |
| Approval | Telegram webhook | Tight coupling; immediate feedback |
| E2E tests | Service role bypass | Don't test real auth; database works |
| Prompts | TypeScript modules | Type-safe; requires code deploy to change |
| Status | Text enum | Flexible; no type safety; mitigate in app layer |
| Schedule | JSONB | Flexible; JSON parsing in queries |
| Credentials | JSONB encrypted | Simple; no external secrets manager |
| Analytics | Once daily | Old data; sufficient for learning loop |
| Content | Immutable rows | More storage; full audit trail |
| Workflows | JSON in git | Manual export; version control + code review |
| LLM provider | Google Gemini (free) | Lower quality than Claude; zero cost for MVP |

All decisions optimize for Phase 1 speed and simplicity. Phase 2+ may revisit (e.g., move to a secrets manager, add real-time analytics, auto-generate types).
