/**
 * packages/shared/src/telegram.ts
 *
 * Helpers for sending Telegram Bot API messages used by the approval gate
 * (Step 5 of the content pipeline) and daily digest notifications.
 *
 * Uses native `fetch` — no extra dependencies required.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TelegramContentPreview {
  contentPieceId: string;
  topic: string;
  angle: string;
  /** First 300 characters of the generated script. */
  scriptPreview: string;
  platform: string;
  /** ISO 8601 datetime string for when the content is scheduled to publish. */
  scheduledFor: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const TELEGRAM_API_BASE = "https://api.telegram.org";

interface TelegramApiResponse {
  ok: boolean;
  description?: string;
  result?: {
    message_id: number;
    [key: string]: unknown;
  };
}

/**
 * Low-level POST to the Telegram Bot API.
 * Throws a descriptive error when `ok` is false.
 */
async function telegramPost(
  botToken: string,
  method: string,
  body: Record<string, unknown>,
): Promise<TelegramApiResponse> {
  const url = `${TELEGRAM_API_BASE}/bot${botToken}/${method}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as TelegramApiResponse;

  if (!data.ok) {
    throw new Error(
      `Telegram API error on ${method}: ${data.description ?? "unknown error"} (HTTP ${response.status})`,
    );
  }

  return data;
}

/**
 * Format a scheduled ISO string into a human-readable local representation.
 * Keeps it simple: relies on Date.toUTCString so no locale dependency.
 */
function formatScheduledTime(isoString: string): string {
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return isoString;
  return date.toUTCString();
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

/**
 * Send a content approval message to a Telegram chat with Approve / Reject
 * inline keyboard buttons. Returns the Telegram message_id on success.
 */
export async function sendApprovalMessage(
  botToken: string,
  chatId: string,
  preview: TelegramContentPreview,
): Promise<{ messageId: number }> {
  const { contentPieceId, topic, angle, scriptPreview, platform, scheduledFor } =
    preview;

  // Truncate script preview defensively (caller should already pass <=300 chars)
  const safePreview =
    scriptPreview.length > 300
      ? `${scriptPreview.slice(0, 297)}...`
      : scriptPreview;

  const scheduledDisplay = formatScheduledTime(scheduledFor);

  const text =
    `*Content Approval Required*\n\n` +
    `*Topic:* ${escapeMarkdown(topic)}\n` +
    `*Angle:* ${escapeMarkdown(angle)}\n` +
    `*Platform:* ${escapeMarkdown(platform)}\n` +
    `*Scheduled:* ${escapeMarkdown(scheduledDisplay)}\n\n` +
    `*Script Preview:*\n${escapeMarkdown(safePreview)}`;

  const data = await telegramPost(botToken, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "✅ Approve",
            callback_data: `approve:${contentPieceId}`,
          },
          {
            text: "❌ Reject",
            callback_data: `reject:${contentPieceId}`,
          },
        ],
      ],
    },
  });

  return { messageId: data.result!.message_id };
}

/**
 * Notify the chat that a content piece failed quality review or generation.
 */
export async function sendFailureNotification(
  botToken: string,
  chatId: string,
  contentPieceId: string,
  topic: string,
  reason: string,
): Promise<void> {
  const text =
    `*Content Generation Failed*\n\n` +
    `*Topic:* ${escapeMarkdown(topic)}\n` +
    `*Content ID:* \`${contentPieceId}\`\n\n` +
    `*Reason:* ${escapeMarkdown(reason)}\n\n` +
    `_The piece has been marked as failed\\. Review your project settings or retry manually\\._`;

  await telegramPost(botToken, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "MarkdownV2",
  });
}

/**
 * Send the end-of-day digest summarising how many pieces were published and
 * how many failed. Used when a project is in `auto` approval mode.
 */
export async function sendDailyDigest(
  botToken: string,
  chatId: string,
  projectName: string,
  publishedCount: number,
  failedCount: number,
): Promise<void> {
  const statusLine =
    failedCount === 0
      ? `All pieces published successfully.`
      : `${failedCount} piece${failedCount === 1 ? "" : "s"} failed — check your dashboard.`;

  const text =
    `*Daily Digest — ${escapeMarkdown(projectName)}*\n\n` +
    `Published: *${publishedCount}*\n` +
    `Failed: *${failedCount}*\n\n` +
    `${escapeMarkdown(statusLine)}`;

  await telegramPost(botToken, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "Markdown",
  });
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/**
 * Escape special Markdown v1 characters that would break Telegram formatting.
 * Telegram's legacy Markdown mode only requires escaping a small subset.
 */
function escapeMarkdown(text: string): string {
  // In Telegram legacy Markdown, the characters that need escaping are:
  // _ * [ `
  return text.replace(/([_*[`])/g, "\\$1");
}
