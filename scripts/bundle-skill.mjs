import realFs from 'node:fs';
import path from 'node:path';
import { buildZip } from './zip-writer.mjs';

/**
 * Shared bundle logic for platforms that consume a skill as a ZIP with the
 * skill folder as the archive root — this shape is common to both:
 *   - claude.ai custom Skills ("the ZIP should contain the skill folder as
 *     its root, not a subfolder" — Anthropic Help Center, verified 2026-09-05)
 *   - OpenAI API project Skills (directory-upload-or-zip, single top-level
 *     folder — developers.openai.com/api/docs, verified 2026-09-05)
 * Neither upload is performed here — this only builds the artifact.
 */
export function collectSkillFiles({ skillDir, skillId, fs = realFs }) {
  const results = [];
  function walk(dir, relPrefix) {
    for (const name of fs.readdirSync(dir)) {
      const abs = path.posix.join(dir, name);
      const rel = relPrefix ? `${relPrefix}/${name}` : name;
      if (fs.statSync(abs).isDirectory()) {
        walk(abs, rel);
      } else {
        // No encoding argument: read raw bytes into a Buffer. Reading as
        // 'utf8' would decode every file as text, corrupting any binary
        // asset (images, PDFs, etc.) whose bytes aren't valid UTF-8.
        results.push({ path: `${skillId}/${rel}`, content: fs.readFileSync(abs) });
      }
    }
  }
  walk(skillDir, '');
  return results;
}

export function buildSkillBundle({ skillDir, skillId, fs = realFs }) {
  const files = collectSkillFiles({ skillDir, skillId, fs });
  return buildZip(files);
}

/**
 * Splits a registry's skills into those eligible for a bundle target
 * (claude-ai, openai-api, ...) and those that aren't — so a bundler can
 * report the ineligible ones explicitly, with their reason, instead of
 * silently omitting them from its output.
 *
 * IMPORTANT: this checks `skill.bundle_targets[target]`, a separate
 * dimension from `skill.platforms`. Both are defined precisely in
 * docs/DESIGN.md's "platforms vs. bundle_targets" section:
 *   - `platforms`      = native runtime host surfaces the deterministic
 *                         eligibility router may execute the skill on
 *                         (codex, claude-code, cursor, opencode — and
 *                         claude-ai/chatgpt for a skill actually routable
 *                         as a live task there, e.g. ush-repo-evidence-plan).
 *   - `bundle_targets` = artifact/package distribution surfaces — can this
 *                         skill be packaged as a portable bundle for that
 *                         surface at all.
 * A skill's `platforms` list has no bearing on whether it can be packaged
 * for a bundle-consuming surface; conflating the two was a Phase 1.2 bug
 * (bundle-openai.mjs used to key off the "chatgpt" platform entry, which
 * describes a completely different product surface than the OpenAI API's
 * project-Skills resource — see scripts/bundle-targets.mjs for the valid
 * bundle_targets keys, `claude-ai` and `openai-api`, which are deliberately
 * NOT the same strings as any `platforms` value).
 *
 * A skill with no `bundle_targets[target]` entry at all fails closed as
 * ineligible — bundle eligibility is never assumed, only declared.
 * SUPPORTED and SUPPORTED_WITH_RESTRICTIONS are both bundle-eligible:
 * packaging a skill (a portable artifact) is a different question from
 * whether every invocation of it will have every capability it might want
 * at runtime — that's the deterministic eligibility filter's job, not the
 * bundler's.
 */
export function partitionBundleEligibility(registry, target) {
  const eligible = [];
  const ineligible = [];
  for (const skill of registry.skills) {
    const entry = skill.bundle_targets && skill.bundle_targets[target];
    if (entry && entry.status !== 'UNSUPPORTED') {
      eligible.push(skill);
    } else {
      ineligible.push({
        skill_id: skill.skill_id,
        reason: entry ? entry.reason : `no bundle_targets["${target}"] entry declared for this skill`,
      });
    }
  }
  return { eligible, ineligible };
}
