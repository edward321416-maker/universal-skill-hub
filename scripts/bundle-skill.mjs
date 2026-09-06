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
 * Splits a registry's skills into those eligible for a bundle-target
 * platform (it lists that platform in skill.platforms) and those that
 * aren't — so a bundler can report the ineligible ones explicitly instead
 * of silently omitting them from its output.
 */
export function partitionBundleEligibility(registry, platformKey) {
  const eligible = [];
  const ineligible = [];
  for (const skill of registry.skills) {
    if ((skill.platforms || []).includes(platformKey)) {
      eligible.push(skill);
    } else {
      ineligible.push(skill);
    }
  }
  return { eligible, ineligible };
}
