import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

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
