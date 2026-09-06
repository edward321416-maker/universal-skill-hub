import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { collectSkillFiles, partitionBundleEligibility } from './bundle-skill.mjs';
import { buildZip } from './zip-writer.mjs';

/**
 * Deterministic ZIP bundle generator for the OpenAI API "project Skills"
 * resource (distinct from both the ChatGPT product's native Skill upload
 * and the Codex CLI filesystem skill directory — see docs/DESIGN.md's
 * platform table). Does NOT call the OpenAI API and requires no API key —
 * it only writes a local .zip a human can upload themselves via the
 * skills.versions.create endpoint.
 *
 * Shape and limits verified against developers.openai.com/api (checked
 * 2026-09-05): "Zip the top-level folder and upload the zip file";
 * constraints "maximum zip upload size is 50 MB, maximum file count per
 * skill version is 500, and maximum uncompressed file size is 25 MB" —
 * enforced here as a build-time check so an oversized bundle fails loudly
 * instead of failing an upload a human wasn't expecting.
 */
const MAX_ZIP_BYTES = 50 * 1024 * 1024;
const MAX_FILE_COUNT = 500;
const MAX_UNCOMPRESSED_FILE_BYTES = 25 * 1024 * 1024;

export function validateOpenAiLimits({ files, zip }) {
  const errors = [];
  if (zip.length > MAX_ZIP_BYTES) errors.push(`zip is ${zip.length} bytes, exceeds the 50 MB OpenAI API limit`);
  if (files.length > MAX_FILE_COUNT) errors.push(`bundle has ${files.length} files, exceeds the 500-file OpenAI API limit`);
  for (const f of files) {
    const size = Buffer.byteLength(f.content, 'utf8');
    if (size > MAX_UNCOMPRESSED_FILE_BYTES) errors.push(`file "${f.path}" is ${size} bytes, exceeds the 25 MB per-file OpenAI API limit`);
  }
  return { valid: errors.length === 0, errors };
}

export function buildOpenAiBundle({ skillDir, skillId, fs: fsImpl }) {
  const files = collectSkillFiles({ skillDir, skillId, fs: fsImpl });
  const zip = buildZip(files);
  const check = validateOpenAiLimits({ files, zip });
  return { zip, files, ...check };
}

function runCli() {
  const registry = JSON.parse(fs.readFileSync(path.join('registry', 'skills-index.json'), 'utf8'));
  const outDir = path.join('dist', 'bundles', 'openai');
  fs.mkdirSync(outDir, { recursive: true });
  let failed = 0;

  const { eligible, ineligible } = partitionBundleEligibility(registry, 'chatgpt');
  for (const skill of ineligible) {
    console.log(`SKIP (not eligible for the OpenAI API project-Skills surface): ${skill.skill_id}`);
  }

  for (const skill of eligible) {
    const result = buildOpenAiBundle({ skillDir: skill.path, skillId: skill.skill_id });
    if (!result.valid) {
      console.error(`FAIL: ${skill.skill_id}: ${result.errors.join('; ')}`);
      failed += 1;
      continue;
    }
    const outPath = path.join(outDir, `${skill.skill_id}.zip`);
    fs.writeFileSync(outPath, result.zip);
    console.log(`OK: wrote ${outPath} (${result.zip.length} bytes)`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

if (process.argv[1] && import.meta.url === url.pathToFileURL(process.argv[1]).href) {
  runCli();
}
