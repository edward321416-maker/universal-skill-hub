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
        results.push({ path: `${skillId}/${rel}`, content: fs.readFileSync(abs, 'utf8') });
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
