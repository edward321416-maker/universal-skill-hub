import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { buildSkillBundle, partitionBundleEligibility } from './bundle-skill.mjs';

/**
 * Deterministic ZIP bundle generator for claude.ai custom Skills.
 * Does NOT upload anything and requires no credential — it only writes a
 * local .zip file for a human to upload themselves via Settings > Features
 * > Customize > Skills. Shape verified against Anthropic's own
 * documentation (support.claude.com "How to create custom skills",
 * checked 2026-09-05): "Create a ZIP file of the folder, where the ZIP
 * should contain the skill folder as its root (not a subfolder)."
 *
 * No claude.ai-specific numeric size/file-count limit is enforced here —
 * none was found in the documentation consulted, so none is invented.
 */
function runCli() {
  const registry = JSON.parse(fs.readFileSync(path.join('registry', 'skills-index.json'), 'utf8'));
  const outDir = path.join('dist', 'bundles', 'claude-ai');
  fs.mkdirSync(outDir, { recursive: true });

  const { eligible, ineligible } = partitionBundleEligibility(registry, 'claude-ai');
  for (const entry of ineligible) {
    console.log(`SKIP (not eligible for claude-ai): ${entry.skill_id} — ${entry.reason}`);
  }
  for (const skill of eligible) {
    const zip = buildSkillBundle({ skillDir: skill.path, skillId: skill.skill_id });
    const outPath = path.join(outDir, `${skill.skill_id}.zip`);
    fs.writeFileSync(outPath, zip);
    console.log(`OK: wrote ${outPath} (${zip.length} bytes)`);
  }
}

if (process.argv[1] && import.meta.url === url.pathToFileURL(process.argv[1]).href) {
  runCli();
}
