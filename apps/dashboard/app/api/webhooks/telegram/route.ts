/**
 * apps/dashboard/app/api/webhooks/telegram/route.ts
 *
 * Next.js Route Handler for Telegram Bot webhook callbacks.
 *
 * Telegram calls this endpoint when a user taps an inline keyboard button
 * (Approve / Reject) on a content approval message sent by the pipeline.
 *
 * Security model:
 *  - We use the Supabase service role key (server-side only) to look up the
 *    content piece and verify it belongs to a real project owned by a real user
 *    before applying any status change.
 *  - No user session is available on an inbound webhook — that is expected.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TelegramUpdate {
  update_id: number;
  callback_query?: {
    id: string;
    data: string;
    message?: {
      message_id: number;
      chat: { id: number };
    };
  };
}

type ApprovalAction = "approve" | "reject";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TELEGRAM_API_BASE = "https://api.telegram.org";

/** UUID v4 regex — used to validate the content_piece_id from callback data. */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Helper: answer the Telegram callback query (stops the loading spinner)
// ---------------------------------------------------------------------------

async function answerCallbackQuery(
  botToken: string,
  callbackQueryId: string,
  text: string,
): Promise<void> {
  const url = `${TELEGRAM_API_BASE}/bot${botToken}/answerCallbackQuery`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  });
  // Intentionally not throwing on failure — answering the callback is best-effort.
  // Telegram will retry the webhook only if we return a non-2xx status, which we
  // control separately.
}

// ---------------------------------------------------------------------------
// Helper: parse callback_data into action + content piece id
// ---------------------------------------------------------------------------

function parseCallbackData(
  data: string,
): { action: ApprovalAction; contentPieceId: string } | null {
  const colonIndex = data.indexOf(":");
  if (colonIndex === -1) return null;

  const action = data.slice(0, colonIndex);
  const contentPieceId = data.slice(colonIndex + 1);

  if (action !== "approve" && action !== "reject") return null;
  if (!UUID_REGEX.test(contentPieceId)) return null;

  return { action, contentPieceId };
}

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Parse body
  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  // 2. Validate that this is a callback_query update
  const callbackQuery = update.callback_query;
  if (!callbackQuery?.data) {
    // Not a callback query (e.g. a plain message update) — acknowledge silently.
    return NextResponse.json({ ok: true });
  }

  // 3. Parse and validate callback data format
  const parsed = parseCallbackData(callbackQuery.data);
  if (!parsed) {
    return NextResponse.json(
      { ok: false, error: "unrecognised callback_data format" },
      { status: 400 },
    );
  }

  const { action, contentPieceId } = parsed;

  // 4. Build a service-role Supabase client (bypasses RLS — server-side only)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[telegram-webhook] Missing Supabase env vars");
    return NextResponse.json(
      { ok: false, error: "server misconfiguration" },
      { status: 500 },
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // 5. Security: look up the content piece and verify it belongs to a real
  //    project owned by a real user.
  const { data: contentPiece, error: fetchError } = await supabase
    .from("content_pieces")
    .select("id, status, project_id, projects!inner(user_id)")
    .eq("id", contentPieceId)
    .single();

  if (fetchError || !contentPiece) {
    console.warn(
      `[telegram-webhook] Content piece not found: ${contentPieceId}`,
      fetchError?.message,
    );
    // Answer the callback so the spinner stops, then return 200 to stop Telegram retries.
    const botToken = process.env.TELEGRAM_BOT_TOKEN ?? "";
    if (botToken) {
      await answerCallbackQuery(botToken, callbackQuery.id, "Content not found.");
    }
    return NextResponse.json({ ok: true });
  }

  // Confirm the project has an owning user (RLS policy requires this)
  const projectsRelation = contentPiece.projects as unknown as { user_id: string } | { user_id: string }[];
  const ownedProject = Array.isArray(projectsRelation)
    ? projectsRelation[0]
    : projectsRelation;

  if (!ownedProject?.user_id) {
    console.error(
      `[telegram-webhook] Content piece ${contentPieceId} has no owning user`,
    );
    return NextResponse.json({ ok: false, error: "orphaned content piece" }, { status: 422 });
  }

  // 6. Apply the status update
  const newStatus = action === "approve" ? "approved" : "rejected";

  const { error: updateError } = await supabase
    .from("content_pieces")
    .update({ status: newStatus })
    .eq("id", contentPieceId);

  if (updateError) {
    console.error(
      `[telegram-webhook] Failed to update content piece ${contentPieceId}:`,
      updateError.message,
    );
    return NextResponse.json(
      { ok: false, error: "database update failed" },
      { status: 500 },
    );
  }

  // 7. Answer the callback query — this removes the loading spinner in Telegram
  const botToken = process.env.TELEGRAM_BOT_TOKEN ?? "";
  const answerText =
    action === "approve" ? "✅ Approved!" : "❌ Rejected";

  if (botToken) {
    await answerCallbackQuery(botToken, callbackQuery.id, answerText);
  } else {
    console.warn("[telegram-webhook] TELEGRAM_BOT_TOKEN not set — skipping answerCallbackQuery");
  }

  console.info(
    `[telegram-webhook] Content piece ${contentPieceId} marked as ${newStatus} by Telegram callback`,
  );

  return NextResponse.json({ ok: true });
}
