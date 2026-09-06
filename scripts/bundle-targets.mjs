/**
 * Single source of truth for the set of known bundle-target keys, shared by
 * scripts/registry-consistency.mjs (validates registry entries) and the
 * bundle CLIs (scripts/bundle-claude-ai.mjs, scripts/bundle-openai.mjs),
 * so the valid key list is never duplicated or allowed to drift between
 * "what the registry accepts" and "what a bundler actually keys off of".
 *
 * "claude-ai" = claude.ai custom Skills (ZIP upload).
 * "openai-api" = the OpenAI API "project Skills" resource — distinct from
 * both the ChatGPT product's native Skill feature and the Codex CLI
 * filesystem skill directory (see docs/DESIGN.md's platform table).
 */
export const VALID_BUNDLE_TARGETS = ['claude-ai', 'openai-api'];
