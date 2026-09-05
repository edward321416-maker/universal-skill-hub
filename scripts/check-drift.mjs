import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { renderAdapter, FILESYSTEM_ADAPTER_PLATFORMS } from './render-adapters.mjs';

/**
 * Detects drift by fully re-rendering the adapter from its current canonical
 * source and comparing byte-for-byte against the actual file on disk —
 * NOT by trusting the embedded content-hash marker alone. Trusting the
 * marker alone only proves the marker wasn't touched; it says nothing about
 * whether the body under it was hand-edited afterward. See Phase 1.1
 * hardening notes in docs/DESIGN.md.
 */
export function detectDrift({ skillId, canonicalBody, platform, capabilities, sourceCommit, adapterContent }) {
  if (adapterContent === null || adapterContent === undefined) {
    return { drifted: true, reasonCode: 'MISSING', reason: 'expected generated adapter file is missing' };
  }

  const expected = renderAdapter({ skillId, canonicalBody, platform, capabilities, sourceCommit });

  if (expected.blocked) {
    return { drifted: true, reasonCode: 'BLOCKED', reason: `canonical source now BLOCKs on this platform: ${expected.reason}` };
  }

  if (adapterContent !== expected.content) {
    return {
      drifted: true,
      reasonCode: 'CONTENT_MISMATCH',
      reason: 'adapter file does not byte-for-byte match a fresh render of its canonical source — either the canonical source changed or the generated file was hand-edited; re-run scripts/render-adapters.mjs',
    };
  }

  return { drifted: false };
}

function runCli() {
  const registry = JSON.parse(fs.readFileSync(path.join('registry', 'skills-index.json'), 'utf8'));
  const compatibility = JSON.parse(fs.readFileSync(path.join('registry', 'compatibility.json'), 'utf8'));
  let drifted = 0;
  let checked = 0;

  for (const skill of registry.skills) {
    const canonicalBody = fs.readFileSync(path.join(skill.path, 'SKILL.md'), 'utf8');
    const caps = (compatibility.skills && compatibility.skills[skill.skill_id]) || { requires: [], requires_not: [] };

    const platformsToCheck = skill.platforms.filter((p) => FILESYSTEM_ADAPTER_PLATFORMS.includes(p));
    for (const platform of platformsToCheck) {
      const adapterPath = path.join('adapters', platform, skill.skill_id, 'SKILL.md');
      const exists = fs.existsSync(adapterPath);
      checked += 1;
      const adapterContent = exists ? fs.readFileSync(adapterPath, 'utf8') : null;
      const result = detectDrift({
        skillId: skill.skill_id,
        canonicalBody,
        platform,
        capabilities: caps,
        sourceCommit: skill.source_commit,
        adapterContent,
      });
      if (result.drifted) {
        console.error(`DRIFT [${result.reasonCode}]: ${adapterPath}: ${result.reason}`);
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
