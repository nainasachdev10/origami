/**
 * packages/shared/src/prompts/seo-captions.ts
 *
 * Builds the prompt for the SEO + captions agent (pipeline step 3c).
 *
 * The agent generates all metadata required to maximise discoverability and
 * click-through rate on each platform:
 *
 *   - 2-3 A/B-testable title variants (CTR-optimised for YouTube; hook-optimised for X/IG)
 *   - A caption that matches the project brand voice
 *   - Hashtags (quantity varies per platform)
 *   - YouTube only: 150-200 word description with timestamp markers + up to 15 tags
 *
 * Provider compatibility: works with both Google Gemini (gemini-1.5-flash) and
 * Anthropic Claude (claude-sonnet-*) — the returned string is the full prompt
 * text; wrap it in the appropriate API request body for whichever provider is
 * in use. Current provider: Google Gemini (free tier).
 *
 * @example
 * ```ts
 * const prompt = buildSeoCaptionsPrompt({
 *   topic: "GPT-5 capabilities breakdown",
 *   script: ["1/7 GPT-5 just dropped…", "2/7 Context window is now 1M tokens…"],
 *   platform: "youtube",
 *   nicheKeywords: ["AI", "LLMs", "tech news"],
 *   brandVoicePrompt: "Conversational but technically credible. No hype. Short sentences.",
 * });
 * // Returns a string — the full system prompt for the Anthropic messages API.
 * // Claude's response will be JSON, e.g.:
 * // {
 * //   "title_variants": [
 * //     "GPT-5 Is Here — What Every Developer Needs to Know",
 * //     "I Tested GPT-5: Here's What Actually Changed",
 * //     "GPT-5 vs GPT-4: The Real Differences (Not the Hype)"
 * //   ],
 * //   "caption": "GPT-5 just dropped and the context window changed everything...",
 * //   "hashtags": [],
 * //   "description": "In this video I break down what GPT-5 actually means for developers...\n\n0:00 Intro\n0:30 Context window changes...",
 * //   "tags": ["GPT-5", "AI", "LLMs", "OpenAI", "machine learning"]
 * // }
 * ```
 */

import type { Platform } from "../types";

// ---------------------------------------------------------------------------
// Input / Output type definitions
// ---------------------------------------------------------------------------

/** Full input required to build the SEO + captions system prompt. */
export interface SeoCaptionsInput {
  /** The topic this content piece covers. */
  topic: string;
  /**
   * The script produced by the script-writer agent.
   * Provided so Claude can extract key points for the description and tags.
   * String for single posts / long-form; string[] for threads / carousels.
   */
  script: string | string[];
  /** The target publishing platform. */
  platform: Platform;
  /**
   * The project's niche keywords, e.g. ["AI", "LLMs", "tech news"].
   * Used as seed terms when generating hashtags and YouTube tags.
   */
  nicheKeywords: string[];
  /**
   * The project's brand voice prompt fragment.
   * The caption must match this voice exactly.
   */
  brandVoicePrompt: string;
}

/** The complete SEO + captions output returned by Claude. */
export interface SeoCaptionsOutput {
  /**
   * 2-3 title variants for A/B testing.
   * - YouTube: optimised for CTR (curiosity gap, specificity, power words).
   * - X / Instagram: optimised for engagement (hook-first, opinionated framing).
   * Always exactly 2 or 3 items — never fewer, never more.
   */
  title_variants: string[];
  /**
   * The caption to publish alongside the content.
   * - X: used as the first tweet text or standalone post caption.
   * - Instagram: the post caption below the reel/carousel.
   * - YouTube: the short caption visible above the fold in the feed.
   * Must match the brand voice prompt.
   */
  caption: string;
  /**
   * Hashtags without the "#" prefix — the publisher adds "#" at post time.
   * - X:         3-5 hashtags
   * - Instagram:  15-20 hashtags
   * - YouTube:   empty array (YouTube uses `tags` instead)
   */
  hashtags: string[];
  /**
   * YouTube only (omit for X / Instagram).
   * A 150-200 word video description that:
   * - Opens with 2-3 keyword-rich sentences summarising the video
   * - Includes timestamp markers if the script has clear sections
   * - Ends with a subscribe/follow CTA
   */
  description?: string;
  /**
   * YouTube only (omit for X / Instagram).
   * Up to 15 single- or multi-word tags for YouTube's tag field.
   * Mix broad niche terms with specific long-tail keywords from the topic.
   */
  tags?: string[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Serialize the script to a readable block for the prompt. */
function serializeScript(script: string | string[]): string {
  if (Array.isArray(script)) {
    return script.map((part, i) => `[Part ${i + 1}] ${part}`).join("\n\n");
  }
  return script;
}

/**
 * Returns platform-specific title guidance.
 * Titles for YouTube are CTR-optimised (search + suggested feed).
 * Titles for X / Instagram are engagement hooks (social feed context).
 */
function titleGuidance(platform: Platform): string {
  if (platform === "youtube") {
    return `YouTube title optimisation rules:
- Target 50-70 characters so titles are never truncated in search results.
- Lead with the highest-value keyword naturally — not stuffed.
- Use one of these proven CTR patterns per variant (use a different pattern for each):
    Pattern A — Curiosity gap: "X Things About Y That [Surprising Result]"
    Pattern B — First-person test/experience: "I [Did X]: Here's What [Happened/Changed]"
    Pattern C — Direct comparison or stakes: "[X] vs [Y]: The [Specific Differentiator]"
- Capitalise content words (title case).
- No clickbait that the video doesn't deliver on.
- No ALL CAPS unless a single word needs strong emphasis.`;
  }

  if (platform === "x") {
    return `X (Twitter) title optimisation rules (these become the pinned/featured text or display title):
- Keep under 70 characters so they preview well when the post is embedded.
- Lead with an opinionated claim, a surprising number, or a strong question.
- Conversational tone — read like a tweet, not a press release headline.
- No hashtags in the title (they go in the hashtags field).`;
  }

  // instagram
  return `Instagram title optimisation rules (used as the reel/carousel overlay text or SEO display title):
- Keep under 70 characters.
- Use punchy, visual language — these appear as text overlays in many templates.
- Lead with a benefit, a number, or a provocative question.
- Avoid passive voice.`;
}

/**
 * Returns platform-specific hashtag instructions.
 */
function hashtagInstructions(platform: Platform, nicheKeywords: string[]): string {
  const seeds = nicheKeywords.join(", ");

  if (platform === "x") {
    return `X Hashtags (3-5 total):
- Use 3 to 5 hashtags — no more, no fewer.
- Mix: 1-2 broad niche tags (e.g. from: ${seeds}) + 1-2 specific topic tags + 1 trending tag if relevant.
- Omit the "#" prefix — the publisher appends it.
- Avoid generic tags like "viral" or "trending" that signal spam.
- Return as a JSON array of strings.`;
  }

  if (platform === "instagram") {
    return `Instagram Hashtags (15-20 total):
- Use 15 to 20 hashtags — this is the Instagram sweet spot for discovery.
- Stratified mix:
    5 broad / high-volume tags (100k+ posts): topic area, niche (from: ${seeds})
    7 mid-volume tags (10k-100k posts): specific topic, subtopic, format
    4 low-volume / niche tags (<10k posts): long-tail, very specific community tags
- Omit the "#" prefix — the publisher appends it.
- No spaces within a hashtag.
- Return as a JSON array of strings.`;
  }

  // youtube
  return `YouTube Hashtags:
- YouTube does not use caption hashtags in the traditional sense — leave this as an empty array [].
- Instead, generate up to 15 keyword tags for the "tags" field (see below).`;
}

/**
 * Returns YouTube-specific description and tags instructions.
 * Returns an empty string for non-YouTube platforms.
 */
function youtubeExtras(platform: Platform, nicheKeywords: string[]): string {
  if (platform !== "youtube") return "";

  const seeds = nicheKeywords.join(", ");

  return `
## YouTube Description (required for YouTube only)
Write a 150-200 word video description:
1. Opening paragraph (2-3 sentences): keyword-rich summary of what the video covers.
   Include the main topic keyword naturally in the first sentence.
2. Timestamp section: extract 3-6 logical chapters from the script and list them as:
   0:00 Intro
   0:30 [First main section]
   [continue…]
   If the script is too short for timestamps, omit this section.
3. Closing CTA (1-2 sentences): ask viewers to subscribe, comment, or watch a related video.
Keep the description informative and honest — no keyword stuffing.

## YouTube Tags (required for YouTube only, up to 15)
Generate up to 15 tags. Mix:
- 3-4 broad niche terms (from: ${seeds})
- 5-6 specific topic keywords derived from the script
- 3-4 long-tail keyword phrases (2-4 words each) that match how viewers would search
- 1-2 brand/channel-related terms if applicable
Return as a JSON array of strings. Omit the "#" prefix. No duplicate tags.`;
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

/**
 * Builds the system prompt string for the SEO + captions Claude agent.
 *
 * Generates platform-appropriate titles (for A/B testing), caption, hashtags,
 * and YouTube-specific description + tags. Claude must respond with a JSON
 * object matching {@link SeoCaptionsOutput} and nothing else.
 *
 * @param input - Topic, script, platform, niche keywords, and brand voice.
 * @returns A complete system prompt string ready to pass as `system` in the
 *          Anthropic messages API.
 */
export function buildSeoCaptionsPrompt(input: SeoCaptionsInput): string {
  const { topic, script, platform, nicheKeywords, brandVoicePrompt } = input;

  const scriptBlock = serializeScript(script);
  const titleSection = titleGuidance(platform);
  const hashtagSection = hashtagInstructions(platform, nicheKeywords);
  const youtubeSection = youtubeExtras(platform, nicheKeywords);

  const isYouTube = platform === "youtube";

  // Build the output format hint — conditionally include YouTube fields
  const outputFormatHint = isYouTube
    ? `{
  "title_variants": ["<variant 1>", "<variant 2>", "<variant 3>"],
  "caption": "<caption text>",
  "hashtags": [],
  "description": "<150-200 word YouTube description with timestamps>",
  "tags": ["<tag 1>", "<tag 2>", "...up to 15 tags"]
}`
    : `{
  "title_variants": ["<variant 1>", "<variant 2>", "<optional variant 3>"],
  "caption": "<caption text>",
  "hashtags": ["<hashtag 1>", "<hashtag 2>", "..."]
}`;

  return `You are an SEO and social media copywriting specialist.
Your output feeds directly into an automated publishing pipeline.
Generate metadata that maximises discoverability and click-through rate on ${platform}.

## Topic
${topic}

## Platform
${platform}

## Niche Keywords
${nicheKeywords.join(", ")}

## Brand Voice
${brandVoicePrompt}

## Script (for context — extract key points for metadata)
${scriptBlock}

---

## Task 1 — Title Variants (2-3 variants required)
Generate exactly 2 or 3 title variants for A/B testing. Each variant must be
meaningfully different in framing — not just minor word swaps.

${titleSection}

## Task 2 — Caption
Write one caption that:
- Opens with the most compelling sentence — no warm-up.
- Matches the brand voice exactly as described above.
- Is appropriate for the ${platform} feed (conversational for X/IG, slightly more
  formal for YouTube).
- Does NOT contain hashtags (those go in the hashtags field).
- Length: 1-3 sentences for X; 3-6 sentences for Instagram; 1-2 sentences for YouTube.

## Task 3 — Hashtags
${hashtagSection}
${youtubeSection}

---

## Output Format
Respond with a JSON object only — no markdown, no explanation, no code fences.
The object must exactly match this shape:

${outputFormatHint}

Rules:
- "title_variants" must contain exactly 2 or 3 strings.
- "hashtags" must not include the "#" prefix character.
- ${isYouTube ? '"description" is required and must be 150-200 words. "tags" is required with 1-15 items.' : '"description" and "tags" must be omitted entirely (not even null).'}
- Do not output anything outside the JSON object.`;
}
