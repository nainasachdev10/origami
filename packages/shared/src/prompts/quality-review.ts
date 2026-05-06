/**
 * packages/shared/src/prompts/quality-review.ts
 *
 * Builds the prompt for the quality-review agent (pipeline step 4).
 *
 * The agent reads everything generated in step 3 (script, caption, hashtags)
 * and validates it against four dimensions before the content moves to the
 * approval gate:
 *
 *   1. Brand voice match
 *   2. Factual claim flagging
 *   3. Platform policy compliance
 *   4. Format correctness (length, structure, hashtag count)
 *
 * A piece passes (`passed: true`) only when no `block`-severity issues exist.
 * The pipeline retries generation up to 2 times on failure; after that the
 * content_piece is marked `status = "failed"`.
 *
 * Provider compatibility: works with both Google Gemini (gemini-1.5-flash) and
 * Anthropic Claude (claude-sonnet-*) — the returned string is the full prompt
 * text; wrap it in the appropriate API request body for whichever provider is
 * in use. Current provider: Google Gemini (free tier).
 *
 * @example
 * ```ts
 * const prompt = buildQualityReviewPrompt({
 *   topic: "GPT-5 capabilities breakdown",
 *   script: ["1/7 GPT-5 just dropped…", "2/7 Context window is now 1M tokens…"],
 *   caption: "The LLM landscape just shifted. Here's what changed.",
 *   hashtags: ["#GPT5", "#AI", "#LLMs"],
 *   brandVoicePrompt: "Conversational but technically credible. No hype.",
 *   platform: "x",
 *   contentStyle: "thread",
 * });
 * // Returns a string — the full system prompt for the Anthropic messages API.
 * // Claude's response will be JSON, e.g.:
 * // {
 * //   "passed": true,
 * //   "score": 88,
 * //   "issues": [],
 * //   "suggestions": ["Tweet 3 could be tightened — currently 278 chars with a weak ending."]
 * // }
 * ```
 */

import type { Platform } from "../types";

// ---------------------------------------------------------------------------
// Input / Output type definitions
// ---------------------------------------------------------------------------

/** Full input required to build the quality-review system prompt. */
export interface QualityReviewInput {
  /** The topic this content piece covers. */
  topic: string;
  /**
   * The script as produced by the script-writer agent.
   * String for single posts / long-form; string[] for threads / carousels.
   */
  script: string | string[];
  /** The caption produced by the SEO-captions agent. */
  caption: string;
  /** The hashtags produced by the SEO-captions agent. */
  hashtags: string[];
  /**
   * The project's brand voice prompt fragment.
   * Used to evaluate tone / style match.
   */
  brandVoicePrompt: string;
  /** The target publishing platform. */
  platform: Platform;
  /** The content style / format identifier. */
  contentStyle: string;
}

/** A single quality issue found by the reviewer. */
export interface QualityIssue {
  /**
   * Category of the issue:
   * - "brand_voice":    tone, style, or vocabulary does not match brand voice
   * - "factual_claim":  unverified statistic, date, or assertion
   * - "platform_policy": content that could violate platform rules
   * - "format":         structural error (wrong numbering, missing section, etc.)
   * - "length":         a part exceeds platform character / word limits
   */
  type: "brand_voice" | "factual_claim" | "platform_policy" | "format" | "length";
  /**
   * Severity of the issue:
   * - "block": must be fixed before publishing — causes `passed: false`
   * - "warn":  should be fixed but will not block publishing on its own
   */
  severity: "block" | "warn";
  /** Clear, actionable description of the issue. */
  description: string;
  /**
   * Optional location hint to help the writer fix it.
   * e.g. "Tweet 3", "Slide 2 body", "Caption line 1", "Hashtag #XYZ"
   */
  location?: string;
}

/** The complete quality-review result returned by Claude. */
export interface QualityReviewOutput {
  /**
   * True only when there are zero `block`-severity issues.
   * A piece with warn-only issues still passes.
   */
  passed: boolean;
  /**
   * Overall quality score from 0 (unusable) to 100 (perfect).
   * Scoring guide embedded in the prompt:
   *   90-100: publish-ready, minimal or no issues
   *   75-89:  good, minor warn issues only
   *   60-74:  acceptable, several warns or one block
   *   <60:    needs significant revision
   */
  score: number;
  /**
   * All issues found, sorted by severity (block first) then by position
   * in the content.
   */
  issues: QualityIssue[];
  /**
   * Optional improvement suggestions that are not classified as issues.
   * e.g. "Consider adding a statistic to tweet 4 to boost engagement."
   */
  suggestions: string[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Serialize the script field to a human-readable block for the prompt. */
function serializeScript(script: string | string[]): string {
  if (Array.isArray(script)) {
    return script.map((part, i) => `[Part ${i + 1}]\n${part}`).join("\n\n");
  }
  return script;
}

/**
 * Returns platform-specific format rules to embed in the review checklist.
 * These are the concrete, measurable constraints Claude must validate against.
 */
function platformFormatRules(platform: Platform, contentStyle: string): string {
  if (platform === "x") {
    if (contentStyle === "thread") {
      return `- Each individual tweet must be ≤280 characters (count every character including spaces and the "N/total" prefix).
- Thread must contain between 5 and 10 tweets.
- Tweets must be numbered in sequential "N/total" format with consistent "total" (e.g. all say "1/7", "2/7", not a mix of "1/7" and "3/8").
- The opening tweet must function as a standalone hook.
- The final tweet must contain a call-to-action.`;
    }
    return `- The post must be ≤280 characters total.
- Only one post allowed (not a thread).`;
  }

  if (platform === "youtube") {
    if (contentStyle === "long-form") {
      return `- Script must support 5-10 minutes of spoken content (roughly 700-1400 words at 140 wpm).
- Must contain: a hook section, at least 3 distinct main points, and a CTA.
- No single section should be blank or missing.`;
    }
    return `- Script must support ≤90 seconds of spoken content (roughly ≤210 words at 140 wpm).
- Must contain: a hook, core content, and a CTA.
- Must be tightly edited — no filler.`;
  }

  if (platform === "instagram") {
    if (contentStyle === "carousel") {
      return `- Must contain between 6 and 9 slides.
- Slide 1 must be a title/hook card.
- Final slide must contain a CTA.
- Each content slide must have a clear header.`;
    }
    return `- Script must support ≤60 seconds of spoken content (roughly ≤150 words at 150 wpm).
- Must alternate VISUAL CUE and VOICEOVER sections.
- Must open with a hook in the first 3 seconds.
- Must end with a verbal + visual CTA.`;
  }

  return `- Validate length and structure appropriate for ${platform} ${contentStyle}.`;
}

/**
 * Returns platform-specific hashtag count rules.
 */
function hashtagRules(platform: Platform): string {
  if (platform === "x") {
    return "X: 3-5 hashtags. More than 5 is a block issue (looks spammy, suppressed by algorithm).";
  }
  if (platform === "instagram") {
    return "Instagram: 15-20 hashtags. Fewer than 15 is a warn; 0 is a block.";
  }
  return "YouTube: hashtags are not used in captions. Any hashtags here are a warn.";
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

/**
 * Builds the system prompt string for the quality-review Claude agent.
 *
 * Embeds the full content to review and a structured four-dimension checklist.
 * Claude must respond with a JSON object matching {@link QualityReviewOutput}
 * and nothing else.
 *
 * @param input - Everything generated in pipeline step 3 plus project metadata.
 * @returns A complete system prompt string ready to pass as `system` in the
 *          Anthropic messages API.
 */
export function buildQualityReviewPrompt(input: QualityReviewInput): string {
  const {
    topic,
    script,
    caption,
    hashtags,
    brandVoicePrompt,
    platform,
    contentStyle,
  } = input;

  const scriptBlock = serializeScript(script);
  const hashtagsBlock = hashtags.length > 0 ? hashtags.join(" ") : "(none)";
  const formatRules = platformFormatRules(platform, contentStyle);
  const hashtagRule = hashtagRules(platform);

  return `You are a senior content quality reviewer for an autonomous social media publishing system.
Your reviews gate content before it goes live. Be rigorous but fair — your job is to
catch real problems, not to rewrite good content.

## Content Under Review

**Topic:** ${topic}
**Platform:** ${platform}
**Format:** ${contentStyle}

### Script
${scriptBlock}

### Caption
${caption}

### Hashtags
${hashtagsBlock}

---

## Brand Voice Reference
${brandVoicePrompt}

---

## Review Checklist (perform ALL four checks)

### Check 1 — Brand Voice Match
Compare the script AND caption against the brand voice reference above.
- Does the tone match (formal vs conversational, analytical vs punchy, etc.)?
- Is the vocabulary consistent with the stated brand voice?
- Are there any sentences that sound off-brand (overly corporate, overly casual, etc.)?
- Flag deviations as "brand_voice" issues.
  - Use "block" severity if the overall tone is fundamentally wrong.
  - Use "warn" severity for isolated sentences or word choices.

### Check 2 — Factual Claims
Read the script for any specific:
- Statistics or percentages (e.g. "AI adoption grew 40% last year")
- Dates or deadlines (e.g. "launching in Q2 2025")
- Named product versions or feature claims (e.g. "GPT-5 has a 1M token context")
- Attributions to named people or organisations
For each such claim, create a "factual_claim" issue at "warn" severity with the
exact claim text so it can be verified before publishing. Do NOT block for factual
claims — that is the human reviewer's job. Warn only.

### Check 3 — Platform Policy Compliance
Check for content that could violate ${platform}'s community guidelines:
- No promotion of violence, hate speech, or illegal activity
- No explicit sexual content
- No misleading health or financial claims that could constitute prohibited advertising
- No content that impersonates real people or brands deceptively
Flag any violations as "platform_policy" issues. Use "block" severity for clear
violations; "warn" for borderline cases.

### Check 4 — Format Correctness
Validate the script against these specific rules for ${platform} / ${contentStyle}:

${formatRules}

Hashtag rule: ${hashtagRule}

Also check:
- Caption must not be empty (empty caption = block).
- Caption should not contain the same hashtags already in the hashtags field (duplicate = warn).
- Flag all format violations as "format" or "length" issues with appropriate severity.

---

## Scoring Guide
After all checks, assign a score 0-100:
  90-100  Publish-ready. Zero or near-zero issues, all minor warns.
  75-89   Good quality. Minor warn issues only, no blocks.
  60-74   Acceptable. Several warns or exactly one block (edge case).
  40-59   Below bar. Multiple blocks or pervasive brand voice failure.
  0-39    Unusable. Fundamental problems throughout.

## Pass/Fail Rule
Set "passed": true ONLY if there are zero "block"-severity issues.
If even one block issue exists, "passed" must be false.

---

## Output Format
Respond with a JSON object only — no markdown, no explanation, no code fences.
Sort the issues array: block issues first, then warn issues, in order of appearance.

{
  "passed": <boolean>,
  "score": <integer 0-100>,
  "issues": [
    {
      "type": "<brand_voice | factual_claim | platform_policy | format | length>",
      "severity": "<block | warn>",
      "description": "<clear, actionable description>",
      "location": "<optional: e.g. 'Tweet 3', 'Slide 2', 'Caption', 'Hashtag #XYZ'>"
    }
  ],
  "suggestions": [
    "<optional improvement suggestion not classified as an issue>"
  ]
}

If there are no issues, set "issues" to [].
If there are no suggestions, set "suggestions" to [].
Do not output anything outside the JSON object.`;
}
