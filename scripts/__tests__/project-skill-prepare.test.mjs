import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const hub = fileURLToPath(new URL('../../', import.meta.url));
const cli = path.join(hub, 'scripts/project-skill-prepare.mjs');
const id = 'ush-repo-evidence-plan';
const registry = JSON.parse(fs.readFileSync(path.join(hub, 'registry/skills-index.json')));
const canonical = fs.readFileSync(path.join(hub, registry.skills.find(s => s.skill_id === id).path, 'SKILL.md'));
function fixture(t, runtime = 'codex') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ush-prepare-test-'));
  t.after(() => { assert.equal(path.dirname(root), os.tmpdir()); assert.ok(path.basename(root).startsWith('ush-prepare-test-')); fs.rmSync(root, { recursive: true, force: true }); });
  const target = path.join(root, 'project with spaces'); fs.mkdirSync(target);
  assert.equal(spawnSync('git', ['init', target], { encoding: 'utf8' }).status, 0);
  const context = path.join(root, 'context.json');
  const project = { identity: 'fixture', project_scope: 'fixture', runtime, policy: { allowedSkillIds: [id] }, availableInputs: ['repository'], availableTools: ['git_diff_read'], availableCapabilities: ['repository_evidence'], grantedPermissions: [] };
  const save = () => fs.writeFileSync(context, JSON.stringify(project)); save();
  const run = (...extra) => spawnSync(process.execPath, [cli, '--project-root', target, '--context', context, ...extra], { cwd: root, encoding: 'utf8' });
  return { root, target, context, project, save, run, folder: runtime === 'codex' ? '.agents' : '.claude' };
}
const reports = r => { assert.equal(r.status, 0, r.stderr); return r.stdout.trim().split('\n').map(line => JSON.parse(line)); };

test('Windows short directory spelling identifies the same Git root', { skip: process.platform !== 'win32' }, t => {
  const f = fixture(t);
  const short = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '(New-Object -ComObject Scripting.FileSystemObject).GetFolder($env:USH_TEST_TARGET).ShortPath'], { encoding: 'utf8', env: { ...process.env, USH_TEST_TARGET: f.target } });
  assert.equal(short.status, 0, short.stderr);
  const alias = short.stdout.trim();
  if (!alias.includes('~')) { t.skip('8.3 aliases unavailable on this volume'); return; }
  const r = spawnSync(process.execPath, [cli, '--project-root', alias, '--context', f.context, '--apply'], { encoding: 'utf8' });
  assert.equal(reports(r).at(-1).mode, 'APPLIED');
  assert.deepEqual(fs.readFileSync(path.join(f.target, '.agents/skills', id, 'SKILL.md')), canonical);
});

test('preview is read-only; explicit apply from foreign CWD places only exact candidates', t => {
  const f = fixture(t);
  const before = fs.readdirSync(f.target);
  const [preview] = reports(f.run()); assert.equal(preview.mode, 'PREVIEW');
  assert.deepEqual(preview.candidateIds, [id]); assert.deepEqual(fs.readdirSync(f.target), before);
  const result = reports(f.run('--apply')); assert.deepEqual(result.map(r => r.mode), ['PREVIEW', 'APPLIED']);
  assert.deepEqual(fs.readdirSync(path.join(f.target, '.agents/skills')), [id]);
  assert.deepEqual(fs.readFileSync(path.join(f.target, '.agents/skills', id, 'SKILL.md')), canonical);
  assert.equal(result[1].metrics.materializedHubSkills, 1);
  assert.equal(JSON.parse(fs.readFileSync(result[1].receipt)).owner, 'universal-skill-hub');
});

test('invalid CLI/context/runtime inputs fail before writes', t => {
  const f = fixture(t);
  for (const args of [['--unknown'], ['--runtime'], ['--runtime', 'opencode'], ['--runtime', 'claude-code'], ['--confirm-removal'], ['--apply', '--apply'], ['--context', f.context]]) {
    const r = f.run(...args); assert.notEqual(r.status, 0); assert.match(r.stderr, /INVALID_|UNSUPPORTED_/);
  }
  for (const args of [[], ['--project-root', '.', '--context', f.context], ['--project-root', f.target, '--context', 'context.json']]) {
    const r = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' }); assert.notEqual(r.status, 0); assert.match(r.stderr, /INVALID_/);
  }
  const sub = path.join(f.target, 'sub'); fs.mkdirSync(sub);
  const r = spawnSync(process.execPath, [cli, '--project-root', sub, '--context', f.context], { encoding: 'utf8' });
  assert.notEqual(r.status, 0); assert.match(r.stderr, /INVALID_PROJECT_ROOT/);
  fs.writeFileSync(f.context, '{'); assert.notEqual(f.run('--apply').status, 0);
  assert.equal(fs.existsSync(path.join(f.target, '.agents')), false);
});

for (const runtime of ['codex', 'claude-code']) test(`${runtime}: repeat apply preserves payload, context and unrelated files`, t => {
  const f = fixture(t, runtime), other = path.join(f.target, f.folder, 'skills/other');
  fs.mkdirSync(other, { recursive: true }); fs.writeFileSync(path.join(other, 'SKILL.md'), 'user content');
  fs.writeFileSync(path.join(f.target, 'AGENTS.md'), 'existing policy');
  const contextBefore = fs.readFileSync(f.context);
  reports(f.run('--apply')); const [preview, applied] = reports(f.run('--apply'));
  assert.deepEqual(preview.actions, [{ id, action: 'unchanged' }]);
  assert.equal(applied.metrics.unmanagedPreserved, 1);
  assert.deepEqual(fs.readFileSync(path.join(f.target, f.folder, 'skills', id, 'SKILL.md')), canonical);
  assert.deepEqual(fs.readFileSync(f.context), contextBefore);
  assert.equal(fs.readFileSync(path.join(other, 'SKILL.md'), 'utf8'), 'user content');
  assert.equal(fs.readFileSync(path.join(f.target, 'AGENTS.md'), 'utf8'), 'existing policy');
  assert.equal(fs.existsSync(path.join(f.target, runtime === 'codex' ? '.claude' : '.agents')), false);
});

for (const managed of [false, true]) test(`${managed ? 'edited managed' : 'unmanaged same-ID'} fails closed`, t => {
  const f = fixture(t), file = path.join(f.target, f.folder, 'skills', id, 'SKILL.md');
  if (managed) reports(f.run('--apply'));
  else fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'user version');
  const r = f.run('--apply'); assert.notEqual(r.status, 0); assert.match(r.stderr, managed ? /CONFLICT/ : /UNMANAGED/);
  assert.equal(fs.readFileSync(file, 'utf8'), 'user version');
});

test('policy removal requires confirmation and preserves unrelated content', t => {
  const f = fixture(t); reports(f.run('--apply'));
  const other = path.join(f.target, f.folder, 'skills/other'); fs.mkdirSync(other); fs.writeFileSync(path.join(other, 'SKILL.md'), 'keep');
  f.project.policy.denyAll = true; f.save();
  assert.deepEqual(reports(f.run())[0].actions, [{ id, action: 'remove' }]);
  assert.match(f.run('--apply').stderr, /REMOVAL_CONFIRMATION_REQUIRED/);
  assert.equal(fs.existsSync(path.join(f.target, f.folder, 'skills', id, 'SKILL.md')), true);
  const result = reports(f.run('--apply', '--confirm-removal')).at(-1);
  assert.equal(result.metrics.materializedHubSkills, 0);
  assert.deepEqual(fs.readdirSync(path.join(f.target, f.folder, 'skills')), ['other']);
});

test('overflow is preserved while placement succeeds; allocations remain enforced', t => {
  const f = fixture(t); f.project.budgetSignal = { overflowObserved: true }; f.save();
  const result = reports(f.run('--apply')).at(-1);
  assert.equal(result.metrics.overflowObserved, true); assert.equal(result.metrics.materializedHubSkills, 1);
  assert.equal(result.budget.status, 'OVERFLOW_OBSERVED');
  for (const limit of ['maxCandidates', 'maxDescriptionBytes']) {
    f.project.policy = { allowedSkillIds: [id], [limit]: 0 }; f.save();
    const preview = reports(f.run())[0]; assert.deepEqual(preview.candidateIds, []);
    assert.equal(preview.metrics.budgetExcluded, 1); assert.equal(preview.metrics.overflowObserved, true);
  }
});

test('runtime flag supplies absent runtime without changing context', t => {
  const f = fixture(t); delete f.project.runtime; f.save();
  assert.equal(reports(f.run('--runtime', 'codex', '--apply')).at(-1).runtime, 'codex');
  assert.equal(JSON.parse(fs.readFileSync(f.context)).runtime, undefined);
});

test('pending journal propagates without cleanup or writes', t => {
  const f = fixture(t), dir = path.join(f.target, f.folder); fs.mkdirSync(dir);
  const pending = path.join(dir, '.ush-project-scope.pending.json'); fs.writeFileSync(pending, 'pending');
  assert.match(f.run('--apply').stderr, /RECOVERY_REQUIRED/);
  assert.equal(fs.readFileSync(pending, 'utf8'), 'pending'); assert.deepEqual(fs.readdirSync(dir), ['.ush-project-scope.pending.json']);
});

test('isolated source: canonical tamper rejected and valid managed update succeeds', t => {
  const f = fixture(t), source = path.join(f.root, 'source'); fs.mkdirSync(path.join(source, 'scripts'), { recursive: true });
  for (const name of ['project-skill-prepare.mjs', 'project-scoping.mjs', 'scoping-transaction.mjs', 'orca-bootstrap.mjs', 'eligibility.mjs', 'approval-gate.mjs']) fs.copyFileSync(path.join(hub, 'scripts', name), path.join(source, 'scripts', name));
  for (const name of ['registry', 'skills', 'node_modules']) fs.cpSync(path.join(hub, name), path.join(source, name), { recursive: true });
  const run = () => spawnSync(process.execPath, [path.join(source, 'scripts/project-skill-prepare.mjs'), '--project-root', f.target, '--context', f.context, '--apply'], { encoding: 'utf8' });
  reports(run());
  const entry = registry.skills.find(s => s.skill_id === id), file = path.join(source, entry.path, 'SKILL.md');
  const updated = Buffer.concat([canonical, Buffer.from('\nFixture update.\n')]); fs.writeFileSync(file, updated);
  assert.match(run().stderr, /CANONICAL_INTEGRITY/);
  const target = path.join(f.target, f.folder, 'skills', id, 'SKILL.md'); assert.deepEqual(fs.readFileSync(target), canonical);
  const changed = structuredClone(registry); changed.skills.find(s => s.skill_id === id).content_sha256 = createHash('sha256').update(updated).digest('hex');
  fs.writeFileSync(path.join(source, 'registry/skills-index.json'), JSON.stringify(changed));
  assert.deepEqual(reports(run()).at(-1).actions, [{ id, action: 'update' }]);
  assert.deepEqual(fs.readFileSync(target), updated);
});
