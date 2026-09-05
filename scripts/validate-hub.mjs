import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const NAME_PATTERN = /^ush-[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Minimal frontmatter parser for the flat + one-level-nested YAML subset
 * canonical SKILL.md files use (name, description, metadata: {k: v, ...}).
 * Not a general YAML parser — do not extend beyond this shape without
 * switching to a real YAML library.
 */
function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const lines = match[1].split(/\r?\n/);
  const result = {};
  let currentNestedKey = null;
  for (const line of lines) {
    if (line.trim() === '') continue;
    const nestedMatch = line.match(/^ {2}([A-Za-z0-9_]+):\s*(.*)$/);
    if (nestedMatch && currentNestedKey) {
      result[currentNestedKey][nestedMatch[1]] = nestedMatch[2].trim();
      continue;
    }
    const topMatch = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (topMatch) {
      const [, key, value] = topMatch;
      if (value.trim() === '') {
        currentNestedKey = key;
        result[key] = {};
      } else {
        currentNestedKey = null;
        result[key] = value.trim();
      }
    }
  }
  return result;
}

export function validateSkillDir(dirPath) {
  const errors = [];
  const skillFile = path.join(dirPath, 'SKILL.md');
  const dirName = path.basename(dirPath);

  if (!fs.existsSync(skillFile)) {
    return { valid: false, errors: [`missing SKILL.md in ${dirPath}`] };
  }

  const raw = fs.readFileSync(skillFile, 'utf8');
  const frontmatter = parseFrontmatter(raw);

  if (!frontmatter) {
    return { valid: false, errors: [`missing or malformed frontmatter in ${skillFile}`] };
  }

  const name = frontmatter.name;
  if (!name || !NAME_PATTERN.test(name)) {
    errors.push(`invalid name "${name}" — name must match ${NAME_PATTERN} (lowercase, digits, single hyphens, ush- prefix, no dots)`);
  }

  if (name && name !== dirName) {
    errors.push(`frontmatter name "${name}" does not match directory name "${dirName}" — directory and name must match`);
  }

  if (!frontmatter.description || frontmatter.description.trim() === '') {
    errors.push('missing required "description" field');
  }

  const metadata = frontmatter.metadata || {};
  if (!metadata.status) {
    errors.push('missing required "metadata.status" lifecycle field');
  }

  if (metadata.scope === 'global' && metadata.project) {
    errors.push(`skill declares global scope but also binds to project "${metadata.project}" — project-bound skills must not be global scope`);
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
        const frontmatter = parseFrontmatter(raw);
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
