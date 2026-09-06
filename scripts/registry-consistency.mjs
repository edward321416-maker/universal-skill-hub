import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import url from 'node:url';
import { load as loadYaml } from 'js-yaml';

/**
 * Field ownership (see docs/DESIGN.md "Registry <-> canonical consistency"):
 *
 * Canonical-source-owned (registry/skills-index.json must mirror these
 * exactly; if they drift apart it is a bug, not a legitimate override):
 *   - skill_id      <- canonical frontmatter `name`
 *   - version       <- canonical frontmatter `metadata.version`
 *   - scope         <- canonical frontmatter `metadata.scope`
 *   - risk          <- canonical frontmatter `metadata.risk`
 *   - status        <- canonical frontmatter `metadata.status`
 *
 * Derived, not owned by either side (must equal a fresh computation):
 *   - content_sha256 <- sha256 of the canonical SKILL.md file's exact bytes
 *
 * Registry-owned (no canonical-source equivalent; the registry is the only
 * source of truth for these):
 *   - path, platforms, source_repo, source_path, source_commit
 */
export function checkConsistency({ registryEntry, canonicalContent }) {
  const errors = [];
  const match = canonicalContent.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const frontmatter = match ? loadYaml(match[1]) || {} : {};
  const metadata = frontmatter.metadata || {};

  if (frontmatter.name !== registryEntry.skill_id) {
    errors.push(`registry skill_id "${registryEntry.skill_id}" does not match canonical frontmatter name "${frontmatter.name}"`);
  }
  if (metadata.version !== registryEntry.version) {
    errors.push(`registry version "${registryEntry.version}" does not match canonical metadata.version "${metadata.version}"`);
  }
  if (metadata.scope !== registryEntry.scope) {
    errors.push(`registry scope "${registryEntry.scope}" does not match canonical metadata.scope "${metadata.scope}"`);
  }
  if (metadata.risk !== registryEntry.risk) {
    errors.push(`registry risk "${registryEntry.risk}" does not match canonical metadata.risk "${metadata.risk}"`);
  }
  if (metadata.status !== registryEntry.status) {
    errors.push(`registry status "${registryEntry.status}" does not match canonical metadata.status "${metadata.status}"`);
  }

  const actualHash = crypto.createHash('sha256').update(canonicalContent).digest('hex');
  if (actualHash !== registryEntry.content_sha256) {
    errors.push(`registry content_sha256 "${registryEntry.content_sha256}" does not match the canonical file's actual hash "${actualHash}"`);
  }

  return { consistent: errors.length === 0, errors };
}

function runCli() {
  const registry = JSON.parse(fs.readFileSync(path.join('registry', 'skills-index.json'), 'utf8'));
  let errorCount = 0;

  for (const skill of registry.skills) {
    const canonicalContent = fs.readFileSync(path.join(skill.path, 'SKILL.md'), 'utf8');
    const result = checkConsistency({ registryEntry: skill, canonicalContent });
    if (!result.consistent) {
      for (const e of result.errors) {
        console.error(`INCONSISTENT: ${skill.skill_id}: ${e}`);
        errorCount += 1;
      }
    }
  }

  console.log(`checked ${registry.skills.length} registry entr${registry.skills.length === 1 ? 'y' : 'ies'}, ${errorCount} inconsistency/-ies.`);
  process.exit(errorCount > 0 ? 1 : 0);
}

if (process.argv[1] && import.meta.url === url.pathToFileURL(process.argv[1]).href) {
  runCli();
}
