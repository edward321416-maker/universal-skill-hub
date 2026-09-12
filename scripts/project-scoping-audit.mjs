import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { load } from 'js-yaml';
import { scopeProject, reconcileProject } from './project-scoping.mjs';
import { safePath, digest } from './orca-bootstrap.mjs';

// Explicit read-only project inputs; only a newly created disposable synthetic
// project receives files. Never loads credentials, executes manifests or edits policy.
const [finalCheck, decode, output] = process.argv.slice(2);
if (!finalCheck || !decode || !output) throw new Error('Usage: node scripts/project-scoping-audit.mjs <final-check-root> <decode-root> <output.json>');
const source = process.cwd();
const registry = JSON.parse(fs.readFileSync('registry/skills-index.json', 'utf8'));
for (const s of registry.skills) {
  const bytes = fs.readFileSync(safePath(source, s.path + '/SKILL.md'));
  if (digest(bytes) !== s.content_sha256) throw new Error('CANONICAL_INTEGRITY');
  s.description = load(bytes.toString('utf8').match(/^---\n([\s\S]*?)\n---/)[1]).description;
}
const conflicts = JSON.parse(fs.readFileSync('registry/conflicts.json', 'utf8')).conflicts;
const inventory = root => {
  if (!fs.existsSync(root)) return { root, files: 0, descriptionBytes: 0, names: [], duplicateNames: [] };
  const names = []; let bytes = 0;
  // Direct skill folders only, intentionally not an assertion about discovery.
  for (const id of fs.readdirSync(root).sort()) {
    const file = path.join(root, id, 'SKILL.md');
    if (!fs.existsSync(file)) continue;
    const header = fs.readFileSync(file, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/);
    try { const meta = header ? load(header[1]) : {}; names.push(meta.name ?? id); bytes += Buffer.byteLength(String(meta.description ?? '')); }
    catch { names.push(id + ':INVALID_FRONTMATTER'); }
  }
  return { root, files: names.length, descriptionBytes: bytes, names, duplicateNames: [...new Set(names.filter((n, i) => names.indexOf(n) !== i))] };
};
const homeInventories = ['.claude/skills', '.agents/skills'].map(folder => inventory(path.join(os.homedir(), folder)));
const synthetic = fs.mkdtempSync(path.join(os.tmpdir(), 'ush-decision17-'));
fs.writeFileSync(path.join(synthetic, 'package.json'), '{"name":"synthetic-scoping-project","private":true}\n');
const entries = [
  ['Hub repo', source, { enabledSkillIds: ['ush-repo-evidence-plan'] }],
  ['final-check', finalCheck, { enabledSkillIds: ['ush-repo-evidence-plan'] }],
  // Audit restriction, NOT a claim that DECODE explicitly denies every Hub skill.
  ['decode', decode, { denyAll: true, reason: 'Project policy review pending; existing D021 router preserved' }],
  ['synthetic', synthetic, { allowedSkillIds: ['ush-repo-evidence-plan'], enabledSkillIds: ['ush-repo-evidence-plan'] }],
];
const results = [];
for (const [identity, root, policy] of entries) {
  if (!fs.existsSync(root)) throw new Error('PROJECT_MISSING: ' + identity);
  const manifests = ['package.json', 'frontend/package.json', 'requirements.txt', 'backend/requirements.txt', 'docker-compose.yml'].filter(p => fs.existsSync(path.join(root, p)));
  for (const p of manifests) {
    const text = fs.readFileSync(path.join(root, p), 'utf8');
    if (p.endsWith('.json')) JSON.parse(text);
    else if (p.endsWith('.yml')) load(text);
    else text.split(/\r?\n/).filter(line => line.trim() && !line.startsWith('#'));
  }
  let git = false;
  try { git = execFileSync('git', ['-C', root, 'rev-parse', '--is-inside-work-tree'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() === 'true'; } catch {}
  const project = { identity, project_scope: identity, runtime: 'claude-code', policy, availableInputs: ['repository'],
    availableTools: git ? ['git_diff_read'] : [], availableCapabilities: git ? ['repository_evidence'] : [], grantedPermissions: [] };
  const scoped = scopeProject({ registry, project, conflicts });
  const local = inventory(path.join(root, '.claude/skills'));
  const shared = inventory(path.join(root, '.agents/skills'));
  let materialization = null;
  if (identity === 'synthetic') materialization = reconcileProject({ sourceRoot: source, targetRoot: root, registry, project, conflicts, apply: true });
  // Count observed Hub-named files separately from ownership/visibility.
  scoped.metrics.materializedHubSkills = materialization?.metrics.materializedHubSkills ?? local.names.filter(n => registry.skills.some(s => s.skill_id === n)).length;
  scoped.metrics.unmanagedPreserved = materialization?.metrics.unmanagedPreserved ?? null;
  results.push({ identity, root, manifests, project, metrics: scoped.metrics, budget: scoped.budget,
    candidateIds: scoped.candidates.map(s => s.skill_id), excluded: scoped.excluded,
    localInventoryBefore: local, sharedInventoryBefore: shared,
    materialization: materialization ? 'ACTUAL_CANONICAL_LOCAL_FALLBACK' : 'READ_ONLY_AUDIT',
    hubModelVisible: null, overflowWarning: null, actualLoadedSkill: null });
}
const report = { observedAt: new Date().toISOString(), sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  warning: { origin: 'USER_SUPPLIED_BASELINE', excludedReported: 66, reproduced: null,
    exact: 'Exceeded skills context budget.\nAll skill descriptions were removed and 66 additional skills were not included in the model-visible skills list.' },
  host: { homeInventories, runtimeDiscoveredTotal: null, runtimeModelVisibleTotal: null, ordering: 'UNVERIFIED', pluginActiveInventory: null }, results };
// Keep the evidence bounded: counts and duplicates suffice for third-party roots.
for (const item of [...homeInventories, ...results.flatMap(r => [r.localInventoryBefore, r.sharedInventoryBefore])]) {
  item.hubNames = item.names.filter(n => registry.skills.some(s => s.skill_id === n));
  delete item.names;
}
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output, synthetic, projects: results.map(r => ({ project: r.identity, candidates: r.candidateIds, metrics: r.metrics })) }, null, 2));
