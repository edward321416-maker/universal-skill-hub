import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import url from 'node:url';

export function detectDrift({ canonicalBody, adapterContent }) {
  const markerMatch = adapterContent.match(/canonical_content_sha256:\s*([0-9a-f]{64})/);
  if (!markerMatch) {
    return { drifted: true, reason: 'generated adapter file has no canonical_content_sha256 marker — it was likely hand-edited or corrupted' };
  }
  const embeddedHash = markerMatch[1];
  const currentHash = crypto.createHash('sha256').update(canonicalBody).digest('hex');
  if (embeddedHash !== currentHash) {
    return { drifted: true, reason: `embedded hash ${embeddedHash} does not match current canonical hash ${currentHash} — re-run scripts/render-adapters.mjs` };
  }
  return { drifted: false };
}

function runCli() {
  const registry = JSON.parse(fs.readFileSync(path.join('registry', 'skills-index.json'), 'utf8'));
  let drifted = 0;
  let checked = 0;

  for (const skill of registry.skills) {
    const canonicalBody = fs.readFileSync(path.join(skill.path, 'SKILL.md'), 'utf8');
    for (const platform of skill.platforms) {
      const adapterPath = path.join('adapters', platform, skill.skill_id, 'SKILL.md');
      if (!fs.existsSync(adapterPath)) continue;
      checked += 1;
      const adapterContent = fs.readFileSync(adapterPath, 'utf8');
      const result = detectDrift({ canonicalBody, adapterContent });
      if (result.drifted) {
        console.error(`DRIFT: ${adapterPath}: ${result.reason}`);
        drifted += 1;
      }
    }
  }

  console.log(`checked ${checked} adapter file(s), ${drifted} drifted.`);
  process.exit(drifted > 0 ? 1 : 0);
}

if (process.argv[1] && import.meta.url === url.pathToFileURL(process.argv[1]).href) {
  runCli();
}
