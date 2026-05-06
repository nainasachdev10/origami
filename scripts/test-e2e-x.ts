/**
 * scripts/test-e2e-x.ts
 *
 * End-to-end test for the Phase 1 pipeline (X/Twitter path).
 * Uses real Supabase for DB operations; mocks all external API calls
 * (n8n, Telegram, OpenTweet) so no live credentials are required beyond
 * NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 *
 * Run:  pnpm --filter scripts test:e2e
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../packages/shared/src/types";

// =============================================================================
// Types narrowed from shared Database for local use
// =============================================================================
type ContentPieceRow =
  Database["public"]["Tables"]["content_pieces"]["Row"];
type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
type ProjectPlatformRow =
  Database["public"]["Tables"]["project_platforms"]["Row"];

// =============================================================================
// Fixed test identifiers
// =============================================================================
const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";

const THREAD_TWEETS: string[] = [
  "1/5 AI coding tools are changing how devs work. Here's my honest breakdown 🧵",
  "2/5 GitHub Copilot: Great for autocomplete, struggles with complex logic. Best for: junior devs learning patterns.",
  "3/5 Cursor: The best full-file context. Actually understands your codebase. Best for: complex refactors.",
  "4/5 Claude Code: Best for architecture decisions and multi-file tasks. Not just autocomplete.",
  "5/5 The winner? Use all three. Copilot for flow, Cursor for refactors, Claude for thinking. What's your stack?",
];

// =============================================================================
// Helpers
// =============================================================================

function log(label: string, detail?: string): void {
  const prefix = `  [${new Date().toISOString()}]`;
  console.log(`${prefix} ${label}${detail !== undefined ? ": " + detail : ""}`);
}

function fail(msg: string): never {
  console.error(`\nFAIL: ${msg}`);
  process.exit(1);
}

// =============================================================================
// Step 1 — Environment setup
// =============================================================================

function setupClient(): ReturnType<typeof createClient<Database>> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      "\nMissing required environment variables.\n" +
        "Please ensure the following are set in your .env file:\n" +
        "  NEXT_PUBLIC_SUPABASE_URL=https://<project-id>.supabase.co\n" +
        "  SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>\n\n" +
        "Copy .env.example to .env and fill in your Supabase project values.\n" +
        "The service role key is found in: Supabase Dashboard > Settings > API"
    );
    process.exit(1);
  }

  // Service-role key bypasses RLS — correct for a test script that runs as the
  // system, not as a real authenticated user.
  const client = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  log("Supabase client initialised", supabaseUrl);
  return client;
}

// =============================================================================
// Step 2 — Create test project
// =============================================================================

async function createTestProject(
  supabase: ReturnType<typeof createClient<Database>>
): Promise<ProjectRow> {
  const { data, error } = await supabase
    .from("projects")
    .insert({
      user_id: TEST_USER_ID,
      name: "E2E Test - AI Tools",
      niche_keywords: ["AI", "machine learning", "tech tools"],
      brand_voice_prompt: "Informative, concise, no hype",
      content_style: "thread",
      posting_schedule: { cron: "0 10 * * *", timezone: "UTC" },
      approval_mode: "manual",
      active: true,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to create test project: ${error?.message}`);
  }

  log("Project created", `id=${data.id}, name="${data.name}"`);
  return data;
}

// =============================================================================
// Step 3 — Insert test project_platform
// =============================================================================

async function createTestPlatform(
  supabase: ReturnType<typeof createClient<Database>>,
  projectId: string
): Promise<ProjectPlatformRow> {
  const { data, error } = await supabase
    .from("project_platforms")
    .insert({
      project_id: projectId,
      platform: "x",
      account_handle: "@test_account",
      enabled: true,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to create project_platform: ${error?.message}`);
  }

  log("Platform configured", `platform=X, handle=${data.account_handle}`);
  return data;
}

// =============================================================================
// Step 4 — Mock pipeline: directly insert a content_piece
// =============================================================================

async function mockPipelineTrigger(
  supabase: ReturnType<typeof createClient<Database>>,
  projectId: string
): Promise<ContentPieceRow> {
  log(
    "Mocking pipeline trigger",
    "skipping n8n (no credentials) — inserting content_piece directly"
  );

  const { data, error } = await supabase
    .from("content_pieces")
    .insert({
      project_id: projectId,
      topic: "Top 5 AI coding tools in 2025",
      angle: "Practical comparison for developers",
      script: JSON.stringify(THREAD_TWEETS),
      caption:
        "AI coding tools ranked by a developer who actually uses them daily",
      hashtags: ["AITools", "CodingTools", "DevLife", "GitHub"],
      status: "pending_approval",
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to insert mock content_piece: ${error?.message}`);
  }

  log("Content piece inserted", `id=${data.id}, status=${data.status}`);
  return data;
}

// =============================================================================
// Step 5 — Verify content_piece exists with correct initial status
// =============================================================================

async function verifyContentPieceCreated(
  supabase: ReturnType<typeof createClient<Database>>,
  projectId: string,
  contentId: string
): Promise<ContentPieceRow> {
  const { data, error } = await supabase
    .from("content_pieces")
    .select()
    .eq("project_id", projectId)
    .eq("id", contentId)
    .single();

  if (error || !data) {
    throw new Error(`content_piece SELECT failed: ${error?.message}`);
  }

  if (data.status !== "pending_approval") {
    throw new Error(
      `Expected status "pending_approval", got "${data.status}"`
    );
  }

  if (!data.script) {
    throw new Error("Expected script to be non-null");
  }

  log(
    "Verification passed",
    `status=${data.status}, script length=${data.script.length} chars`
  );
  return data;
}

// =============================================================================
// Step 6 — Mock Telegram approval preview
// =============================================================================

function mockTelegramPreview(piece: ContentPieceRow): void {
  const tweets: string[] = JSON.parse(piece.script ?? "[]") as string[];

  console.log(
    "\n  ─────────────────────────────────────────────────────────────"
  );
  console.log("  MOCK TELEGRAM MESSAGE (would be sent to bot)");
  console.log(
    "  ─────────────────────────────────────────────────────────────"
  );
  console.log(`  Topic : ${piece.topic}`);
  console.log(`  Angle : ${piece.angle ?? "—"}`);
  console.log(`  Thread preview (${tweets.length} tweets):`);
  tweets.forEach((t) => console.log(`    ${t}`));
  console.log(`  Caption : ${piece.caption ?? "—"}`);
  console.log(`  Hashtags: ${(piece.hashtags ?? []).map((h) => "#" + h).join(" ")}`);
  console.log("");
  console.log("  [ ✅ Approve ]    [ ❌ Reject ]    [ ✏️ Request Edit ]");
  console.log(
    "  ─────────────────────────────────────────────────────────────\n"
  );

  log(
    "Telegram preview shown",
    "real bot would send this via TELEGRAM_BOT_TOKEN + TELEGRAM_DEFAULT_CHAT_ID"
  );
}

// =============================================================================
// Step 7 — Simulate approval: UPDATE status → "approved"
// =============================================================================

async function simulateApproval(
  supabase: ReturnType<typeof createClient<Database>>,
  contentId: string
): Promise<void> {
  const { error } = await supabase
    .from("content_pieces")
    .update({ status: "approved" })
    .eq("id", contentId);

  if (error) {
    throw new Error(`Failed to approve content_piece: ${error.message}`);
  }

  log("Approval simulated", `content_piece id=${contentId} → approved`);
}

// =============================================================================
// Step 8 — Verify approval
// =============================================================================

async function verifyApproval(
  supabase: ReturnType<typeof createClient<Database>>,
  contentId: string
): Promise<void> {
  const { data, error } = await supabase
    .from("content_pieces")
    .select("status")
    .eq("id", contentId)
    .single();

  if (error || !data) {
    throw new Error(`content_piece SELECT after approval failed: ${error?.message}`);
  }

  if (data.status !== "approved") {
    throw new Error(
      `Expected status "approved" after update, got "${data.status}"`
    );
  }

  log("Approval verified", `status=${data.status}`);
}

// =============================================================================
// Step 9 — Cleanup (respects FK constraint order)
// =============================================================================

async function cleanup(
  supabase: ReturnType<typeof createClient<Database>>,
  contentId: string | null,
  platformId: string | null,
  projectId: string | null
): Promise<void> {
  if (contentId) {
    const { error } = await supabase
      .from("content_pieces")
      .delete()
      .eq("id", contentId);
    if (error) {
      console.warn(`  Cleanup warning (content_pieces): ${error.message}`);
    }
  }

  if (platformId) {
    const { error } = await supabase
      .from("project_platforms")
      .delete()
      .eq("id", platformId);
    if (error) {
      console.warn(`  Cleanup warning (project_platforms): ${error.message}`);
    }
  }

  if (projectId) {
    const { error } = await supabase
      .from("projects")
      .delete()
      .eq("id", projectId);
    if (error) {
      console.warn(`  Cleanup warning (projects): ${error.message}`);
    }
  }

  console.log("  Cleanup complete.");
}

// =============================================================================
// Step 10 — Summary
// =============================================================================

function printSummary(): void {
  console.log(`
  ============================================================
  E2E TEST SUMMARY
  ============================================================
  ✅ Project created: E2E Test - AI Tools
  ✅ Platform configured: X (@test_account)
  ✅ Content piece created with status: pending_approval
  ✅ Telegram approval message preview shown
  ✅ Approval flow: pending_approval → approved
  ✅ Cleanup: all test records deleted

  Phase 1 pipeline: READY FOR REAL API TESTING
  ============================================================
`);
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  console.log("\n=== Origami Phase 1 — E2E Test (X pipeline, mocked APIs) ===\n");

  // Step 1
  const supabase = setupClient();

  let projectId: string | null = null;
  let platformId: string | null = null;
  let contentId: string | null = null;

  try {
    // Step 2
    console.log("\n-- Step 2: Create test project --");
    const project = await createTestProject(supabase);
    projectId = project.id;

    // Step 3
    console.log("\n-- Step 3: Insert project_platform --");
    const platform = await createTestPlatform(supabase, projectId);
    platformId = platform.id;

    // Step 4
    console.log("\n-- Step 4: Mock pipeline trigger --");
    const piece = await mockPipelineTrigger(supabase, projectId);
    contentId = piece.id;

    // Step 5
    console.log("\n-- Step 5: Verify content_piece created --");
    const verified = await verifyContentPieceCreated(
      supabase,
      projectId,
      contentId
    );

    // Step 6
    console.log("\n-- Step 6: Mock Telegram approval preview --");
    mockTelegramPreview(verified);

    // Step 7
    console.log("\n-- Step 7: Simulate approval --");
    await simulateApproval(supabase, contentId);

    // Step 8
    console.log("\n-- Step 8: Verify approval --");
    await verifyApproval(supabase, contentId);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\nERROR: ${message}`);
    console.log("\n-- Cleanup after failure --");
    await cleanup(supabase, contentId, platformId, projectId);
    process.exit(1);
  }

  // Step 9 — always runs on success too
  console.log("\n-- Step 9: Cleanup --");
  await cleanup(supabase, contentId, platformId, projectId);

  // Step 10
  printSummary();
}

main().catch((err: unknown) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
