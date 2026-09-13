import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const hub = fileURLToPath(new URL('../../', import.meta.url));
const cli = path.join(hub, 'scripts/ush.mjs');
const id = 'ush-repo-evidence-plan';
const registry = JSON.parse(fs.readFileSync(path.join(hub, 'registry/skills-index.json')));
const canonical = fs.readFileSync(path.join(hub, registry.skills.find(s => s.skill_id === id).path, 'SKILL.md'));

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ush-cli-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const project = path.join(root, 'project with spaces');
  fs.mkdirSync(project);
  assert.equal(spawnSync('git', ['init', project], { encoding: 'utf8' }).status, 0);
  const nested = path.join(project, 'nested', 'dir');
  fs.mkdirSync(nested, { recursive: true });
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { cwd: nested, encoding: 'utf8' });
  return { project, run };
}

test('ush prepare from any project subdirectory safely prepares the default Codex skill with no context file', t => {
  const f = fixture(t);
  const first = f.run('prepare');
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /Prepared 1 Skill for Codex/);

  const skill = path.join(f.project, '.agents', 'skills', id, 'SKILL.md');
  assert.deepEqual(fs.readFileSync(skill), canonical);
  const receipt = JSON.parse(fs.readFileSync(path.join(f.project, '.agents', '.ush-project-scope.json'), 'utf8'));
  assert.equal(receipt.owner, 'universal-skill-hub');
  assert.equal(receipt.platform, 'codex');
  assert.deepEqual(Object.keys(receipt.files), [id]);
  assert.equal(fs.existsSync(path.join(f.project, '.claude')), false);

  const second = f.run('prepare');
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /Already prepared/);
  assert.deepEqual(fs.readFileSync(skill), canonical);
});

test('ush rejects unsupported commands without touching the project', t => {
  const f = fixture(t);
  const result = f.run('unknown');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /USAGE: ush prepare/);
  assert.equal(fs.existsSync(path.join(f.project, '.agents')), false);
});
