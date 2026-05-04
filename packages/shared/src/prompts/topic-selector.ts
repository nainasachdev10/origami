/**
 * packages/shared/src/prompts/topic-selector.ts
 *
 * Builds the system prompt for the topic-selection Claude agent (pipeline step 2).
 *
 * The agent receives trend data, recent topics (to avoid duplication), and
 * historical top performers, then returns 1-3 topic objects as a JSON array.
 *
 * Model used: claude-sonnet-4-20250514
 *
 * @example
 * ```ts
 * const prompt = buildTopicSelectorPrompt({
 *   nicheKeywords: ["AI", "LLMs", "tech news"],
 *   trendData: [
 *     { source: "google_trends", topic: "GPT-5 release", score: 92,
 *       context: "OpenAI announced GPT-5 beta access this week" },
 *     { source: "reddit", topic: "Claude API rate limits", score: 74,
 *       context: "r/MachineLearning thread with 4k upvotes" },
 *   ],
 *   recentTopics: ["Llama 3 benchmark review", "Google Gemini 2.0 deep dive"],
 *   topPerformers: [
 *     { topic: "OpenAI vs Anthropic cost breakdown", platform: "x",
 *       views: 48200, engagement: 3100 },
 *   ],
 * });
 * // Returns a string — the full system prompt to pass as `system` in the
 * // Anthropic messages API call.
 * // Claude's response will be a JSON array, e.g.:
 * // [
 * //   {
 * //     "topic": "GPT-5 capabilities breakdown",
 * //     "angle": "What GPT-5 means for developers building with LLMs",
 * //     "target_platform": "x",
 * //     "reasoning": "High trend score (92) on Google Trends, aligns with niche, not covered recently"
 * //   }
 * // ]
 * ```
 */

import type { Platform } from "../types";

// ---------------------------------------------------------------------------
// Input / Output type definitions
// ---------------------------------------------------------------------------

/** A single trending signal from one research source. */
export interface TrendItem {
  /** Where this signal came from. */
  source: "google_trends" | "reddit" | "youtube" | "x";
  /** The trending topic or keyword. */
  topic: string;
  /**
   * Relative trend score from 0 (not trending) to 100 (peak interest).
   * Normalised across all sources before being passed here.
   */
  score: number;
  /** One-sentence description of why this is trending right now. */
  context: string;
}

/** A historical content piece that performed exceptionally well. */
export interface PerformanceItem {
  /** The topic title that was published. */
  topic: string;
  /** Which platform the analytics came from. */
  platform: Platform;
  /** Total view count. */
  views: number;
  /** Sum of likes + comments + shares. */
  engagement: number;
}

/** Full input required to build the topic-selector system prompt. */
export interface TopicSelectorInput {
  /**
   * The project's niche keywords, e.g. ["AI", "LLMs", "tech news"].
   * Used to ground the agent in the project's content focus.
   */
  nicheKeywords: string[];
  /** Raw trend signals gathered in step 1 of the pipeline. */
  trendData: TrendItem[];
  /**
   * Topic strings from the last 7 days of content_pieces.
   * Claude must not select any of these — strict deduplication.
   */
  recentTopics: string[];
  /**
   * Top-performing content from the last 30 days of content_analytics.
   * Claude should look for patterns (format, angle, framing) to replicate.
   */
  topPerformers: PerformanceItem[];
}

/**
 * Shape of each object Claude must include in its JSON array response.
 * Matches the angle + platform fields stored in content_pieces.
 */
export interface TopicOutput {
  /** Clear, specific topic title suitable for use as a video/post title seed. */
  topic: string;
  /** The editorial angle — what unique take or framing makes this interesting. */
  angle: string;
  /** Which platform this topic is best suited for based on trend source and format fit. */
  target_platform: Platform;
  /** Brief reasoning explaining why this topic was chosen. */
  reasoning: string;
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

/**
 * Builds the system prompt string for the topic-selection Claude agent.
 *
 * Interpolates niche, trend data, recent topics, and top performers into a
 * structured prompt. Claude must respond with a JSON array of 1-3
 * {@link TopicOutput} objects and nothing else.
 *
 * @param input - All context required for topic selection.
 * @returns A complete system prompt string ready to pass as `system` in the
 *          Anthropic messages API.
 */
export function buildTopicSelectorPrompt(input: TopicSelectorInput): string {
  const { nicheKeywords, trendData, recentTopics, topPerformers } = input;

  const niche = nicheKeywords.join(", ");

  const trendList = trendData
    .sort((a, b) => b.score - a.score)
    .map(
      (t, i) =>
        `${i + 1}. [${t.source}] "${t.topic}" — score: ${t.score}/100\n   Context: ${t.context}`
    )
    .join("\n");

  const recentList =
    recentTopics.length > 0
      ? recentTopics.map((t, i) => `${i + 1}. ${t}`).join("\n")
      : "None — this is a fresh start.";

  const performerList =
    topPerformers.length > 0
      ? topPerformers
          .map(
            (p, i) =>
              `${i + 1}. "${p.topic}" on ${p.platform} — ${p.views.toLocaleString()} views, ${p.engagement.toLocaleString()} engagements`
          )
          .join("\n")
      : "No historical data yet — rely on trend signals and niche fit alone.";

  return `You are a content strategy AI specialising in the following niche: ${niche}.

Your task is to select 1 to 3 high-potential topics for today's content pipeline. You will receive:
  - Current trending signals ranked by score (higher = more trending right now)
  - Topics published in the last 7 days (you MUST NOT select any of these)
  - Top-performing historical topics (use these to identify winning angles and formats)

## Niche Keywords
${niche}

## Trending Signals (sorted highest → lowest)
${trendList}

## Topics to AVOID (published in the last 7 days — strict deduplication)
${recentList}

## Top Performers (last 30 days — pattern-match these for angles and framing)
${performerList}

## Selection Criteria
1. The topic must be strongly relevant to the niche keywords listed above.
2. Prefer topics with trend score ≥ 60 unless there are no good fits.
3. Never select a topic that duplicates or closely resembles one in the "avoid" list.
4. Choose the target platform that best fits the topic's nature:
   - "x": fast-moving news, opinions, short comparisons, hot takes
   - "youtube": tutorials, deep dives, reviews, long explanations
   - "instagram": visual demonstrations, quick tips, infographics, lifestyle angles
5. Each topic must have a distinct angle — do not select two topics that would produce similar content.
6. Draw on the top performers to inform the angle or framing, but do not simply repeat them.

## Output Format
Respond with a JSON array only — no markdown, no explanation, no code fences.
Return 1, 2, or 3 objects depending on how many strong candidates exist.
Each object must exactly match this shape:

[
  {
    "topic": "<clear topic title>",
    "angle": "<specific editorial angle or framing>",
    "target_platform": "<x | youtube | instagram>",
    "reasoning": "<one or two sentences explaining why this topic was chosen today>"
  }
]

If there are no trending topics that fit the niche and do not duplicate recent content, return an empty array: []

Do not output anything outside the JSON array.`;
}
