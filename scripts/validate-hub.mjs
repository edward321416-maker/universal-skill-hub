import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { load as loadYaml } from 'js-yaml';

// --- Agent Skills baseline constraints (apply to any Agent-Skills-shaped
// SKILL.md, not specific to this hub) ---
const NAME_MAX_LENGTH = 64;
const DESCRIPTION_MAX_LENGTH = 1024;

// --- Hub-specific constraints (this repo's own rules, layered on top of
// the Agent Skills baseline above) ---
const NAME_PATTERN = /^ush-[a-z0-9]+(-[a-z0-9]+)*$/; // ush- namespace, see docs/DESIGN.md
const VALID_STATUSES = ['EXPERIMENTAL', 'VALIDATED', 'DEPRECATED', 'QUARANTINED']; // registry/lifecycle.json
const VALID_RISKS = ['L0', 'L1', 'L2', 'L3', 'L4']; // docs/DESIGN.md risk model
const VALID_SCOPES = ['global', 'domain', 'project']; // skills/{global,git,game,discord,domain}/ + project-bound
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(-[0-9A-Za-z-.]+)?(\+[0-9A-Za-z-.]+)?$/;

/**
 * Parses SKILL.md frontmatter with a real YAML parser (js-yaml), so
 * quoted scalars, multiline strings, and arbitrarily nested metadata are
 * handled correctly. Returns null if the file has no frontmatter block,
 * and throws if the frontmatter block is present but not valid YAML —
 * callers must catch that to produce a clear validation error instead of
 * crashing.
 */
function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  return loadYaml(match[1]) || {};
}

export function validateSkillDir(dirPath) {
  const errors = [];
  const skillFile = path.join(dirPath, 'SKILL.md');
  const dirName = path.basename(dirPath);

  if (!fs.existsSync(skillFile)) {
    return { valid: false, errors: [`missing SKILL.md in ${dirPath}`] };
  }

  const raw = fs.readFileSync(skillFile, 'utf8');
  let frontmatter;
  try {
    frontmatter = parseFrontmatter(raw);
  } catch (err) {
    return { valid: false, errors: [`invalid YAML frontmatter in ${skillFile}: ${err.message}`] };
  }

  if (!frontmatter) {
    return { valid: false, errors: [`missing or malformed frontmatter in ${skillFile}`] };
  }

  const name = frontmatter.name;
  if (!name || !NAME_PATTERN.test(name)) {
    errors.push(`invalid name "${name}" — name must match ${NAME_PATTERN} (lowercase, digits, single hyphens, ush- prefix, no dots)`);
  }
  if (typeof name === 'string' && name.length > NAME_MAX_LENGTH) {
    errors.push(`name "${name}" is ${name.length} characters — must be at most ${NAME_MAX_LENGTH}`);
  }

  if (name && name !== dirName) {
    errors.push(`frontmatter name "${name}" does not match directory name "${dirName}" — directory and name must match`);
  }

  if (!frontmatter.description || String(frontmatter.description).trim() === '') {
    errors.push('missing required "description" field');
  } else if (String(frontmatter.description).length > DESCRIPTION_MAX_LENGTH) {
    errors.push(`description is ${frontmatter.description.length} characters — must be at most ${DESCRIPTION_MAX_LENGTH}`);
  }

  const metadata = frontmatter.metadata || {};
  if (!metadata.status) {
    errors.push('missing required "metadata.status" lifecycle field');
  } else if (!VALID_STATUSES.includes(metadata.status)) {
    errors.push(`invalid metadata.status "${metadata.status}" — must be one of ${VALID_STATUSES.join('|')}`);
  }

  if (metadata.risk !== undefined && !VALID_RISKS.includes(metadata.risk)) {
    errors.push(`invalid metadata.risk "${metadata.risk}" — must be one of ${VALID_RISKS.join('|')}`);
  }

  if (metadata.scope !== undefined && !VALID_SCOPES.includes(metadata.scope)) {
    errors.push(`invalid metadata.scope "${metadata.scope}" — must be one of ${VALID_SCOPES.join('|')}`);
  }

  if (metadata.version !== undefined && !SEMVER_PATTERN.test(String(metadata.version))) {
    errors.push(`invalid metadata.version "${metadata.version}" — must be valid SemVer (e.g. 1.2.3)`);
  }

  if (metadata.scope === 'global' && metadata.project) {
    errors.push(`skill declares global scope but also binds to project "${metadata.project}" — project-bound skills must not be global scope`);
  }

  const compatibility = frontmatter.compatibility;
  if (compatibility !== undefined) {
    if (typeof compatibility !== 'object' || compatibility === null || Array.isArray(compatibility)) {
      errors.push('optional frontmatter "compatibility" block must be an object');
    } else {
      for (const field of ['requires', 'forbidden_capabilities', 'requires_not']) {
        if (compatibility[field] !== undefined && !Array.isArray(compatibility[field])) {
          errors.push(`optional frontmatter compatibility.${field} must be an array of strings, got ${typeof compatibility[field]}`);
        } else if (Array.isArray(compatibility[field]) && !compatibility[field].every((v) => typeof v === 'string')) {
          errors.push(`optional frontmatter compatibility.${field} must be an array of strings`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateAllSkills(rootDir) {
  const errors = [];
  const seenNames = new Map();

  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (!entry.isDirectory()) continue;
      if (fs.existsSync(path.join(full, 'SKILL.md'))) {
        const result = validateSkillDir(full);
        errors.push(...result.errors);
        const raw = fs.readFileSync(path.join(full, 'SKILL.md'), 'utf8');
        let frontmatter;
        try {
          frontmatter = parseFrontmatter(raw);
        } catch {
          frontmatter = null; // already reported by validateSkillDir above
        }
        const name = frontmatter && frontmatter.name;
        if (name) {
          if (seenNames.has(name)) {
            errors.push(`duplicate skill id "${name}" found at ${full} and ${seenNames.get(name)}`);
          } else {
            seenNames.set(name, full);
          }
        }
      } else {
        walk(full);
      }
    }
  }

  walk(rootDir);
  return { valid: errors.length === 0, errors };
}

if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
  const root = process.argv[2] || 'skills';
  const result = validateAllSkills(root);
  if (result.valid) {
    console.log(`OK: all skills under "${root}" are valid.`);
    process.exit(0);
  } else {
    console.error(`FAIL: ${result.errors.length} error(s) under "${root}":`);
    for (const e of result.errors) console.error(`  - ${e}`);
    process.exit(1);
  }
}
