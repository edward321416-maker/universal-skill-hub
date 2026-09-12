import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createManifest, verifyRelease, resolveContext, deploy, rollback, bridgeEligibility, launch, digest } from '../orca-bootstrap.mjs';

const source = fileURLToPath(new URL('../../', import.meta.url));
const pin = '463446ae2372161dd9431c96bcb52bdfab024001';
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ush-bootstrap-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cache = path.join(root, 'release');
  fs.mkdirSync(cache);
  for (const name of ['scripts', 'registry', 'skills', 'adapters', 'node_modules', 'package.json', 'package-lock.json']) {
    fs.cpSync(path.join(source, name), path.join(cache, name), { recursive: true });
  }
  const target = path.join(root, '한글 project');
  fs.mkdirSync(target);
  return { root, target, release: createManifest(cache, pin), platform: 'codex' };
}

test('deployment reuses installer, preserves exact adapters and is idempotent', async t => {
  const f = fixture(t);
  const first = await deploy(f);
  assert.equal(first.changed, 7);
  assert.equal(first.skills.length, 6);
  for (const skill of first.skills) {
    assert.deepEqual(fs.readFileSync(path.join(f.target, '.agents/skills', skill.id, 'SKILL.md')),
      fs.readFileSync(path.join(f.release.root, 'adapters/codex', skill.id, 'SKILL.md')));
  }
  assert.equal((await deploy(f)).changed, 0);
});

test('known legacy command spelling is accepted without rewriting any policy bytes', async t => {
  const f = fixture(t);
  const legacy = 'node launcher gate C:/approved/config.json';
  await deploy({ ...f, gateCommand: legacy });
  const policy = path.join(f.target, 'AGENTS.md');
  const before = fs.readFileSync(policy);
  const result = await deploy({ ...f, gateCommand: 'node launcher gate canonical-config', legacyGateCommands: [legacy] });
  assert.equal(result.changed, 0);
  assert.deepEqual(fs.readFileSync(policy), before);
  await assert.rejects(deploy({ ...f, gateCommand: 'different command', legacyGateCommands: [] }), /POLICY_CONFLICT/);
  fs.appendFileSync(policy, 'user edit');
  const edited = fs.readFileSync(policy);
  await assert.rejects(deploy({ ...f, gateCommand: legacy, legacyGateCommands: [legacy] }), /POLICY_CONFLICT/);
  assert.deepEqual(fs.readFileSync(policy), edited);
});

test('nested launcher invocation is rejected before preparation', async () => {
  let prepared = false;
  await assert.rejects(launch({ executable: process.execPath, args: ['--version'],
    env: { ...process.env, USH_BOOTSTRAP_ACTIVE: '1' },
    prepare: async () => { prepared = true; return { ready: true }; } }), /EXECUTABLE_RECURSION/);
  assert.equal(prepared, false);
});

test('context requires registered actual cwd, consistent local host and approved owner', t => {
  const f = fixture(t);
  const input = { cwd: f.target, repos: [{ id: 'repo' }], worktrees: [{ id: 'tree', repoId: 'repo', path: f.target, hostId: 'local' }], allowedRepoIds: ['repo'] };
  assert.equal(resolveContext(input).repoId, 'repo');
  assert.throws(() => resolveContext({ ...input, worktrees: [] }), /UNREGISTERED/);
  assert.throws(() => resolveContext({ ...input, allowedRepoIds: [] }), /OWNERSHIP/);
  assert.throws(() => resolveContext({ ...input, worktrees: [{ ...input.worktrees[0], hostId: 'remote', identity: { executionHostId: 'local' } }] }), /HOST/);
});

for (const relative of ['skills/global/ush-repo-evidence-plan/SKILL.md', 'adapters/codex/ush-repo-evidence-plan/SKILL.md', 'scripts/install-skills.mjs']) {
  test('tampering fails before target writes: ' + relative, async t => {
    const f = fixture(t);
    fs.appendFileSync(path.join(f.release.root, relative), '\r\n');
    assert.throws(() => verifyRelease(f.release), /INTEGRITY/);
    await assert.rejects(deploy(f), /INTEGRITY/);
    assert.deepEqual(fs.readdirSync(f.target), []);
  });
}

test('sealed manifests declare their own format version', t => {
  assert.equal(fixture(t).release.manifestVersion, 1);
});

// A manifest this code cannot fully interpret must be refused as a format
// problem, not reported as tampering and not partially enforced.
const unknownFormats = [
  ['absent format version', ({ manifestVersion, ...rest }) => rest],
  ['future format version', r => ({ ...r, manifestVersion: 2 })],
  ['unrecognized top-level key', r => ({ ...r, optionalFiles: { 'README.md': true } })],
  ['relative release root', r => ({ ...r, root: path.basename(r.root) })],
  ['files as an array', r => ({ ...r, files: Object.entries(r.files) })],
  ['structured digest value', r => ({ ...r, files: { ...r.files, 'package.json': { sha256: r.files['package.json'] } } })],
];
for (const [label, mutate] of unknownFormats) {
  test('unknown manifest format is refused before any target write: ' + label, async t => {
    const f = fixture(t);
    const release = mutate(f.release);
    assert.throws(() => verifyRelease(release), /UNKNOWN_MANIFEST_FORMAT/);
    await assert.rejects(deploy({ ...f, release }), /UNKNOWN_MANIFEST_FORMAT/);
    assert.deepEqual(fs.readdirSync(f.target), []);
  });
}

test('modified managed skills are never overwritten', async t => {
  const f = fixture(t);
  await deploy(f);
  const file = path.join(f.target, '.agents/skills/ush-repo-evidence-plan/SKILL.md');
  fs.appendFileSync(file, '\nuser edit');
  const before = fs.readFileSync(file);
  await assert.rejects(deploy(f), /CONFLICT/);
  assert.deepEqual(fs.readFileSync(file), before);
});

test('junction or symlink cannot redirect deployment', async t => {
  const f = fixture(t);
  const outside = path.join(f.root, 'outside');
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(f.target, '.agents'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(deploy(f), /SYMLINK/);
  assert.deepEqual(fs.readdirSync(outside), []);
});

test('policy review is exact-byte and preserves the original prefix', async t => {
  const f = fixture(t);
  const before = Buffer.from('Existing project lock\r\n');
  const policy = path.join(f.target, 'AGENTS.md');
  fs.writeFileSync(policy, before);
  await assert.rejects(deploy(f), /POLICY_REVIEW/);
  await deploy({ ...f, approvedPolicyHashes: [digest(before)] });
  assert.deepEqual(fs.readFileSync(policy).subarray(0, before.length), before);
});

test('concurrent preparations serialize and do not duplicate policy', async t => {
  const f = fixture(t);
  const results = await Promise.all([deploy(f), deploy(f)]);
  assert.deepEqual(results.map(x => x.changed).sort(), [0, 7]);
});

test('user policy edit while waiting for preparation lock is retained', async t => {
  const f = fixture(t);
  await deploy(f);
  const lock = path.join(f.target, '.agents/.ush-bootstrap.lock');
  const fd = fs.openSync(lock, 'wx');
  const pending = deploy(f);
  const policy = path.join(f.target, 'AGENTS.md');
  fs.appendFileSync(policy, 'later user edit\n');
  const edited = fs.readFileSync(policy);
  fs.closeSync(fd);
  fs.unlinkSync(lock);
  await assert.rejects(pending, /POLICY_CONFLICT/);
  assert.deepEqual(fs.readFileSync(policy), edited);
});

// Production rollback. It is never invoked automatically: only an operator
// applies a retained preimage. This replaces an earlier test that exercised a
// synthetic recovery closure defined inside the test itself.
const skillsDir = f => path.join(f.target, '.agents/skills');

test('deployment retains a preimage naming the policy and the directories it created', async t => {
  const f = fixture(t);
  const { preimage } = await deploy(f);
  assert.equal(preimage.preimageVersion, 1);
  assert.equal(preimage.target, f.target);
  assert.equal(preimage.policy.existed, false);
  assert.deepEqual(preimage.createdSkillDirs.map(d => d.relative).sort(),
    verifyRelease(f.release).skills.map(s => '.agents/skills/' + s.skill_id).sort());
});

test('rollback restores the exact policy bytes that existed before deployment', async t => {
  const f = fixture(t);
  const policy = path.join(f.target, 'AGENTS.md');
  const original = Buffer.from('Existing project lock\r\n');
  fs.writeFileSync(policy, original);
  const { preimage } = await deploy({ ...f, approvedPolicyHashes: [digest(original)] });
  assert.equal((await rollback(preimage)).restored, 7);
  assert.deepEqual(fs.readFileSync(policy), original);
});

test('rollback deletes a policy file that did not exist before deployment', async t => {
  const f = fixture(t);
  await rollback((await deploy(f)).preimage);
  assert.equal(fs.existsSync(path.join(f.target, 'AGENTS.md')), false);
});

test('rollback removes only the skill directories deployment created', async t => {
  const f = fixture(t);
  const { preimage } = await deploy(f);
  fs.mkdirSync(path.join(skillsDir(f), 'third-party'));
  fs.writeFileSync(path.join(skillsDir(f), 'third-party/SKILL.md'), 'unrelated');
  await rollback(preimage);
  assert.deepEqual(fs.readdirSync(skillsDir(f)), ['third-party']);
});

test('rollback refuses and changes nothing after a later policy edit', async t => {
  const f = fixture(t);
  const { preimage } = await deploy(f);
  const policy = path.join(f.target, 'AGENTS.md');
  fs.appendFileSync(policy, 'later user edit\n');
  const edited = fs.readFileSync(policy);
  await assert.rejects(rollback(preimage), /ROLLBACK_CONFLICT/);
  assert.deepEqual(fs.readFileSync(policy), edited);
  assert.equal(fs.readdirSync(skillsDir(f)).length, 6);
});

test('rollback refuses and changes nothing after a later managed skill edit', async t => {
  const f = fixture(t);
  const { preimage } = await deploy(f);
  const file = path.join(skillsDir(f), 'ush-repo-evidence-plan/SKILL.md');
  fs.appendFileSync(file, '\nuser edit');
  const edited = fs.readFileSync(file);
  await assert.rejects(rollback(preimage), /ROLLBACK_CONFLICT/);
  assert.deepEqual(fs.readFileSync(file), edited);
  assert.equal(fs.existsSync(path.join(f.target, 'AGENTS.md')), true);
});

test('rollback refuses to remove a created directory that gained an unmanaged file', async t => {
  const f = fixture(t);
  const { preimage } = await deploy(f);
  const extra = path.join(skillsDir(f), 'ush-repo-evidence-plan/notes.md');
  fs.writeFileSync(extra, 'user notes');
  await assert.rejects(rollback(preimage), /ROLLBACK_CONFLICT/);
  assert.equal(fs.existsSync(extra), true);
});

test('rollback of a no-change deployment removes nothing', async t => {
  const f = fixture(t);
  await deploy(f);
  const second = await deploy(f);
  assert.equal(second.changed, 0);
  assert.equal((await rollback(second.preimage)).restored, 0);
  assert.equal(fs.readdirSync(skillsDir(f)).length, 6);
  assert.equal(fs.existsSync(path.join(f.target, 'AGENTS.md')), true);
});

test('rollback refuses a preimage format it cannot interpret', async t => {
  const f = fixture(t);
  const { preimage } = await deploy(f);
  await assert.rejects(rollback({ ...preimage, preimageVersion: 2 }), /UNKNOWN_PREIMAGE_FORMAT/);
  assert.equal(fs.readdirSync(skillsDir(f)).length, 6);
});

test('bridge skips neutral tasks and is explicitly advisory', async t => {
  const f = fixture(t);
  const result = await bridgeEligibility(f.release, { skillId: null });
  assert.equal(result.decision, 'SKIP');
  assert.equal(result.enforcement, 'ADVISORY');
});

test('bridge executes the pinned engine and blocks missing task facts', async t => {
  const f = fixture(t);
  const result = await bridgeEligibility(f.release, { skillId: 'ush-github-task-flow', task: { platform: 'codex' } });
  assert.equal(result.decision, 'BLOCK');
  assert.match(result.reasonCode, /^MISSING_/);
  assert.equal(result.enforcement, 'ADVISORY');
});

test('bridge retains EXPERIMENTAL L3 automatic-write gate with synthetic grants', async t => {
  const f = fixture(t);
  const skill = verifyRelease(f.release).skills.find(x => x.skill_id === 'ush-github-task-flow');
  const result = await bridgeEligibility(f.release, { skillId: skill.skill_id, task: {
    platform: 'codex', autoInvoke: true, explicitIntent: true, hasPermission: true,
    availableInputs: skill.required_inputs, availableTools: skill.required_tools,
    availableCapabilities: skill.required_capabilities, grantedPermissions: skill.required_permissions
  } });
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.reasonCode, 'EXPERIMENTAL_L3_AUTO');
});

test('launcher diagnostic bypass is only for standalone diagnostics', async () => {
  let prepared = 0;
  const prepare = async () => { prepared++; return { ready: true }; };
  assert.equal(await launch({ executable: process.execPath, args: ['--version'], prepare }), 0);
  assert.equal(prepared, 0);
  assert.equal(await launch({ executable: process.execPath, args: ['-e', 'process.exit(7)', '--', '--help'], prepare }), 7);
  assert.equal(prepared, 1);
  await assert.rejects(launch({ executable: process.execPath, args: ['-e', 'process.exit(0)'], prepare: async () => { throw new Error('not ready'); } }), /not ready/);
});

for (const readiness of [undefined, null, {}, { ready: false }]) {
  test('launcher rejects non-ready preparation: ' + JSON.stringify(readiness), async () => {
    await assert.rejects(launch({ executable: process.execPath, args: ['-e', 'process.exit(0)'],
      prepare: async () => readiness }), /NOT_READY/);
  });
}
