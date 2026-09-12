import fs from 'node:fs';
import { safePath, digest } from './orca-bootstrap.mjs';

// Phase 1.4-C. ORCA v1.4.200 resolves `orca skills install` to the community
// skills CLI (`npx --yes skills add <repo> ... -y`). Observed on this host:
// it installs the CANONICAL body — byte-equal to the registered
// content_sha256 — and the shared `.agents` folder serves codex and cursor
// while claude-code receives its own placement. Under the non-interactive
// flags Orca passes, a target whose bytes differ is rewritten to canonical
// rather than refused. This module supplies the Hub-side guarantee the native
// installer does not: knowing, before it runs, exactly what it would rewrite.
const PROVIDER_FOLDERS = ['.agents', '.claude'];
const fail = (code, detail = '') => { throw new Error(code + (detail ? ': ' + detail : '')); };

function readOrNull(file) {
  try { return fs.readFileSync(file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

export function inspectNativePlacement({ targetRoot, registry, folder = '.agents' }) {
  if (!PROVIDER_FOLDERS.includes(folder)) fail('UNSUPPORTED_FOLDER', folder);
  const root = safePath(targetRoot);
  const skillsDir = safePath(root, folder + '/skills'); // rejects path escape and symlink redirection
  const skills = registry.skills.map((skill) => {
    const relative = folder + '/skills/' + skill.skill_id + '/SKILL.md';
    const bytes = readOrNull(safePath(root, relative));
    const sha256 = bytes === null ? null : digest(bytes);
    return {
      id: skill.skill_id,
      relative,
      sha256,
      status: bytes === null ? 'ABSENT' : sha256 === skill.content_sha256 ? 'MATCH_CANONICAL' : 'DRIFTED',
    };
  });
  const managed = new Set(registry.skills.map((s) => s.skill_id));
  let unmanaged = [];
  try {
    unmanaged = fs.readdirSync(skillsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !managed.has(entry.name)).map((entry) => entry.name).sort();
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const count = (status) => skills.filter((s) => s.status === status).length;
  return {
    folder,
    root,
    skills,
    unmanaged,
    summary: { matched: count('MATCH_CANONICAL'), drifted: count('DRIFTED'), absent: count('ABSENT') },
  };
}

// What the native installer would do to this target. A DRIFTED file is
// rewritten to canonical without confirmation, so `safe` is false whenever one
// exists — that is the decision the Hub keeps and the native path does not.
// Removal is never planned: unmanaged siblings are reported only.
export function planNativeInstall({ targetRoot, registry, folder = '.agents' }) {
  const report = inspectNativePlacement({ targetRoot, registry, folder });
  const pick = (status) => report.skills.filter((s) => s.status === status).map((s) => s.id);
  const willRewrite = pick('DRIFTED');
  return {
    folder,
    willCreate: pick('ABSENT'),
    willRewrite,
    unchanged: pick('MATCH_CANONICAL'),
    unmanaged: report.unmanaged,
    safe: willRewrite.length === 0,
  };
}
