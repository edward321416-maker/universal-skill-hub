import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectNativePlacement, planNativeInstall } from '../native-parity.mjs';

// Phase 1.4-C. ORCA's native path resolves to `npx skills add <repo> ... -y`,
// which installs the CANONICAL body and, under -y, rewrites a target whose
// bytes differ instead of refusing. These tests cover the Hub-side guarantee
// the native installer does not provide: knowing, before that runs, exactly
// which files it would rewrite.
const source = fileURLToPath(new URL('../../', import.meta.url));
const registry = JSON.parse(fs.readFileSync(path.join(source, 'registry/skills-index.json'), 'utf8'));
const ids = registry.skills.map((s) => s.skill_id);

function target(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ush-native-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function placeCanonical(root, only = ids) {
  for (const skill of registry.skills) {
    if (!only.includes(skill.skill_id)) continue;
    const dir = path.join(root, '.agents/skills', skill.skill_id);
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(path.join(source, skill.path, 'SKILL.md'), path.join(dir, 'SKILL.md'));
  }
  return root;
}

test('a placement matching every registered canonical hash is fully verified', t => {
  const root = placeCanonical(target(t));
  const report = inspectNativePlacement({ targetRoot: root, registry });
  assert.equal(report.folder, '.agents');
  assert.deepEqual(report.skills.map(s => s.status).sort(), ids.map(() => 'MATCH_CANONICAL').sort());
  assert.equal(report.summary.matched, 6);
  assert.equal(report.summary.drifted, 0);
});

test('an absent placement is ABSENT, never reported as drifted', t => {
  const report = inspectNativePlacement({ targetRoot: target(t), registry });
  assert.deepEqual([...new Set(report.skills.map(s => s.status))], ['ABSENT']);
  assert.equal(report.summary.absent, 6);
  assert.equal(report.summary.drifted, 0);
});

test('an edited installed body is DRIFTED and is exactly what a native install would rewrite', t => {
  const root = placeCanonical(target(t));
  const edited = path.join(root, '.agents/skills/ush-repo-evidence-plan/SKILL.md');
  fs.appendFileSync(edited, '\n<!-- local edit -->\n');
  const report = inspectNativePlacement({ targetRoot: root, registry });
  assert.equal(report.skills.find(s => s.id === 'ush-repo-evidence-plan').status, 'DRIFTED');
  assert.equal(report.summary.drifted, 1);

  const plan = planNativeInstall({ targetRoot: root, registry });
  assert.deepEqual(plan.willRewrite, ['ush-repo-evidence-plan']);
  assert.equal(plan.safe, false);
});

// The real observed case: Phase 1.4-B installed generated adapters, whose bytes
// intentionally differ from canonical because they carry provenance.
test('a generated-adapter placement is DRIFTED against canonical, not silently accepted', t => {
  const root = target(t);
  for (const id of ids) {
    const dir = path.join(root, '.agents/skills', id);
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(path.join(source, 'adapters/codex', id, 'SKILL.md'), path.join(dir, 'SKILL.md'));
  }
  const report = inspectNativePlacement({ targetRoot: root, registry });
  assert.equal(report.summary.drifted, 6);
  assert.equal(report.summary.matched, 0);
  assert.equal(planNativeInstall({ targetRoot: root, registry }).safe, false);
});

test('a clean install plan creates every skill and stays safe', t => {
  const plan = planNativeInstall({ targetRoot: target(t), registry });
  assert.deepEqual(plan.willCreate.sort(), [...ids].sort());
  assert.deepEqual(plan.willRewrite, []);
  assert.equal(plan.safe, true);
});

test('unmanaged sibling skills are reported but never scheduled for removal', t => {
  const root = placeCanonical(target(t));
  fs.mkdirSync(path.join(root, '.agents/skills/third-party'), { recursive: true });
  fs.writeFileSync(path.join(root, '.agents/skills/third-party/SKILL.md'), 'unrelated');
  const report = inspectNativePlacement({ targetRoot: root, registry });
  assert.deepEqual(report.unmanaged, ['third-party']);
  const plan = planNativeInstall({ targetRoot: root, registry });
  assert.equal(plan.willRewrite.length, 0);
  assert.equal('willRemove' in plan, false);
});

test('the claude-code provider folder is inspected separately from the shared folder', t => {
  const root = target(t);
  for (const skill of registry.skills) {
    const dir = path.join(root, '.claude/skills', skill.skill_id);
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(path.join(source, skill.path, 'SKILL.md'), path.join(dir, 'SKILL.md'));
  }
  assert.equal(inspectNativePlacement({ targetRoot: root, registry }).summary.absent, 6);
  const claude = inspectNativePlacement({ targetRoot: root, registry, folder: '.claude' });
  assert.equal(claude.summary.matched, 6);
});

test('a redirected or escaping target is refused before any filesystem claim', t => {
  const root = target(t);
  assert.throws(() => inspectNativePlacement({ targetRoot: root, registry, folder: '../escape' }), /UNSUPPORTED_FOLDER/);
  fs.symlinkSync(os.tmpdir(), path.join(root, '.agents'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => inspectNativePlacement({ targetRoot: root, registry }), /SYMLINK/);
});
