/**
 * packages/shared/src/index.ts
 *
 * Barrel export for @origami/shared.
 * Import anything from this package via:
 *
 *   import { Project, buildTopicSelectorPrompt, ... } from "@origami/shared";
 */

export * from "./types";
export * from "./prompts/topic-selector";
export * from "./prompts/script-writer";
export * from "./prompts/quality-review";
export * from "./prompts/seo-captions";
