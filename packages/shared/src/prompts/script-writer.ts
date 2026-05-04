/**
 * packages/shared/src/prompts/script-writer.ts
 *
 * Builds the system prompt for the script-writing Claude agent (pipeline step 3a).
 *
 * Handles all platform × content-style combinations defined in the project spec:
 *   - x + thread       → numbered tweet thread (1/n format, 5-10 tweets, ≤280 chars each)
 *   - x + short-form   → single punchy post (≤280 chars)
 *   - youtube + long-form  → hook (0:00-0:30) → 3-5 main points → CTA (5-10 min)
 *   - youtube + short-form → hook → content → CTA (≤90 seconds)
 *   - instagram + short-form → reel script (visual cues + voiceover)
 *   - instagram + carousel  → slide-by-slide (title card + 4-7 content slides + CTA slide)
 *
 * Model used: claude-sonnet-4-20250514
 *
 * @example
 * ```ts
 * const prompt = buildScriptWriterPrompt({
 *   topic: "GPT-5 capabilities breakdown",
 *   angle: "What GPT-5 means for developers building with LLMs",
 *   brandVoicePrompt: "Conversational but technically credible. No hype. Short sentences.",
 *   platform: "x",
 *   contentStyle: "thread",
 * });
 * // Returns a string — the full system prompt for the Anthropic messages API.
 * // Claude's response will be JSON, e.g.:
 * // {
 * //   "platform": "x",
 * //   "format": "thread",
 * //   "script": [
 * //     "1/7 GPT-5 just dropped. Here's what it actually means for devs building with LLMs:",
 * //     "2/7 Context window is now 1M tokens. That's entire codebases in a single prompt...",
 * //     ...
 * //   ],
 * //   "estimated_length": "7 tweets"
 * // }
 * ```
 */

import type { Platform, ContentStyle } from "../types";

// ---------------------------------------------------------------------------
// Input / Output type definitions
// ---------------------------------------------------------------------------

/** Full input required to build the script-writer system prompt. */
export interface ScriptWriterInput {
  /** The topic to write about (from the topic-selector output). */
  topic: string;
  /** The editorial angle or framing for this piece. */
  angle: string;
  /**
   * The project's brand voice prompt fragment.
   * This is written by the user during project setup and defines tone, style,
   * vocabulary, and personality.  e.g. "Conversational but technically credible.
   * No hype. Short sentences. Always end with a question."
   */
  brandVoicePrompt: string;
  /** Target publishing platform. */
  platform: Platform;
  /** Format / length variant for this platform. */
  contentStyle: ContentStyle;
}

/**
 * Shape of Claude's JSON response for a script.
 * `script` is a single string for standalone posts, and a string[] for
 * multi-part formats (threads, carousels, slide decks).
 */
export interface ScriptOutput {
  /** Platform this script is for. */
  platform: Platform;
  /** Format identifier (e.g. "thread", "short-form", "long-form", "carousel"). */
  format: ContentStyle;
  /**
   * The actual script content.
   * - string: single post / long-form monologue
   * - string[]: ordered list of tweets / carousel slides / video segments
   */
  script: string | string[];
  /**
   * Human-readable length estimate.
   * e.g. "7 tweets", "~6 minutes", "8 slides", "65 seconds"
   */
  estimated_length: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns a detailed, platform × style–specific writing brief to embed in the
 * prompt.  This is the core of the format instruction block.
 */
function formatBrief(platform: Platform, contentStyle: ContentStyle): string {
  if (platform === "x" && contentStyle === "thread") {
    return `FORMAT: X (Twitter) Thread
- Write 5 to 10 tweets numbered in "N/total" format (e.g. "1/7", "2/7", …).
- Every individual tweet MUST be 280 characters or fewer — count carefully.
- Tweet 1 (the hook): immediately state the most surprising or valuable claim to
  make readers tap "Read more". Do NOT start with "I" or a generic intro.
- Tweets 2 to (total-1): deliver one clear point per tweet. Use line breaks for
  readability. Short paragraphs, no walls of text.
- Final tweet (CTA): end with a call-to-action — ask a question, invite a reply,
  or direct readers to another resource.
- Return the script as a JSON array of strings, one string per tweet.
- Do not add extra punctuation or thread markers beyond the "N/total" numbering.`;
  }

  if (platform === "x" && contentStyle === "short-form") {
    return `FORMAT: X (Twitter) Single Post
- Write ONE punchy post that is 280 characters or fewer.
- Open with the most attention-grabbing statement — no warm-up sentences.
- Optionally include 1-2 line breaks for visual clarity.
- No hashtags in the body (the SEO agent adds those separately).
- Return the script as a plain JSON string (not an array).`;
  }

  if (platform === "youtube" && contentStyle === "long-form") {
    return `FORMAT: YouTube Long-Form Script
- Total target duration: 5 to 10 minutes of spoken content.
- Structure:
    [HOOK 0:00-0:30]  Open with a compelling question, bold claim, or story beat
                      that makes viewers watch past the 30-second mark.
    [POINT 1]         First main point with explanation + example/data.
    [POINT 2]         Second main point.
    [POINT 3]         Third main point.
    [POINT 4]         (Optional) Fourth main point if needed.
    [POINT 5]         (Optional) Fifth main point if needed.
    [CTA]             Call-to-action: subscribe prompt, related video suggestion,
                      or viewer question to answer in comments.
- Write as natural spoken dialogue — contractions, short sentences, conversational.
- Include brief stage directions where helpful, e.g. "[cut to screen recording]"
  or "[show graph]", but keep them minimal.
- Return the entire script as a single JSON string with line breaks (\\n).`;
  }

  if (platform === "youtube" && contentStyle === "short-form") {
    return `FORMAT: YouTube Short / Short-Form Script
- Total target duration: under 90 seconds of spoken content (~180-220 words).
- Structure:
    [HOOK 0:00-0:05]  One powerful opening sentence — the viewer decides to stay
                      or scroll in the first 3 seconds.
    [CONTENT]         Rapid, dense delivery of the key insight or tip. No fluff.
    [CTA]             Short, specific call-to-action (follow, comment, next video).
- Write as natural spoken dialogue. Every word must earn its place.
- Return the entire script as a single JSON string with line breaks (\\n).`;
  }

  if (platform === "instagram" && contentStyle === "short-form") {
    return `FORMAT: Instagram Reel Script
- Total target duration: under 60 seconds (~120-150 words spoken).
- Write in two interleaved layers:
    VISUAL CUE: one-line description of what appears on screen (text overlay,
    action, transition, B-roll suggestion).
    VOICEOVER: the spoken line(s) that accompany that visual.
- Repeat the VISUAL CUE / VOICEOVER pattern for each scene.
- Hook must be in the first 3 seconds — show the payoff upfront.
- End with a clear verbal + visual CTA ("Follow for more", "Comment below", etc.).
- Return the script as a single JSON string. Format each scene as:
    "[VISUAL]: <description>\\n[VO]: <spoken text>"
  and separate scenes with a blank line (\\n\\n).`;
  }

  if (platform === "instagram" && contentStyle === "carousel") {
    return `FORMAT: Instagram Carousel
- Write content for 6 to 9 slides total:
    Slide 1 — Title Card:   Bold headline + brief sub-headline. This is the hook
                            — it must make people swipe.
    Slides 2-7 (content):   One key point per slide. Each slide: a short header
                            (≤8 words) + 1-3 punchy supporting sentences.
    Final slide — CTA:      Prompt engagement: save, share, follow, or comment.
                            Include a teaser for what they just learned.
- Keep each slide tight — carousel viewers skim. No paragraphs, only punchy copy.
- Return the script as a JSON array of strings, one string per slide.
  Format each slide as: "<SLIDE HEADER>\\n<slide body text>"`;
  }

  // Fallback for any combination not explicitly handled above
  return `FORMAT: ${platform} / ${contentStyle}
- Write a clear, engaging script appropriate for the platform and content style.
- Match the brand voice provided.
- Return the script as a JSON string (or array for multi-part formats).`;
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

/**
 * Builds the system prompt string for the script-writing Claude agent.
 *
 * Selects the correct format brief based on the platform × contentStyle
 * combination and embeds the topic, angle, and brand voice. Claude must respond
 * with a JSON object matching {@link ScriptOutput} and nothing else.
 *
 * @param input - Topic, angle, brand voice, platform, and content style.
 * @returns A complete system prompt string ready to pass as `system` in the
 *          Anthropic messages API.
 */
export function buildScriptWriterPrompt(input: ScriptWriterInput): string {
  const { topic, angle, brandVoicePrompt, platform, contentStyle } = input;

  const brief = formatBrief(platform, contentStyle);

  return `You are a professional content writer specialising in social media and video scripts.
Your output will be used directly in an automated publishing pipeline — write final,
publish-ready copy that requires no further editing.

## Topic
${topic}

## Angle / Framing
${angle}

## Brand Voice
${brandVoicePrompt}

Apply the brand voice consistently throughout. If the brand voice conflicts with a
platform best practice, prioritise the brand voice — the audience already knows this voice.

## Platform & Format Instructions
${brief}

## Quality Standards
- Every word must serve a purpose. Cut filler, hedging, and repetition.
- Vary sentence length to create rhythm.
- Never open with "In today's", "Welcome back", or "In this video/post".
- Do not fabricate statistics or specific claims — if a data point would strengthen
  the script, write it as a question or acknowledged speculation, not a fact.
- Do not include hashtags or emojis in the script body (the SEO agent handles those).

## Output Format
Respond with a JSON object only — no markdown, no explanation, no code fences.
The object must exactly match this shape:

{
  "platform": "${platform}",
  "format": "${contentStyle}",
  "script": <string or array of strings per the format instructions above>,
  "estimated_length": "<human-readable estimate, e.g. '7 tweets', '~6 minutes', '8 slides', '55 seconds'>"
}

Do not output anything outside the JSON object.`;
}
