import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scopeProject, reconcileProject } from '../project-scoping.mjs';
import { digest } from '../orca-bootstrap.mjs';
import { evaluateEligibility } from '../eligibility.mjs';

const skill = (id = 'relevant', extra = {}) => ({ skill_id: id, scope: 'global', risk: 'L0', status: 'EXPERIMENTAL', platforms: ['claude-code'], runtime_support: { 'claude-code': { status: 'SUPPORTED' } }, description: 'Inspect repository evidence', ...extra });
const project = (extra = {}) => ({ identity: 'test', project_scope: 'test', runtime: 'claude-code', policy: {}, availableInputs: [], availableTools: [], availableCapabilities: [], grantedPermissions: [], ...extra });
const scope = (skills, p = project()) => scopeProject({ registry: { skills }, project: p });
for (const [name, s, p, metric] of [
  ['runtime mismatch', skill('a', { platforms: ['codex'] }), project(), 'runtimeExcluded'],
  ['scope mismatch', skill('a', { project_scope: 'elsewhere' }), project(), 'scopeExcluded'],
  ['missing tool', skill('a', { required_tools: ['git_diff_read'] }), project(), 'requirementsExcluded'],
  ['missing capability', skill('a', { required_capabilities: ['repository_evidence'] }), project(), 'requirementsExcluded'],
  ['policy denied', skill('a'), project({ policy: { blockedSkillIds: ['a'] } }), 'policyExcluded'],
]) test(name, () => { const r = scope([s], p); assert.equal(r.candidates.length, 0); assert.equal(r.metrics[metric], 1); });
test('supported unrestricted skill included; visibility remains unknown', () => {
  const r = scope([skill()]); assert.equal(r.candidates.length, 1); assert.equal(r.metrics.visibilityConfirmed, null); assert.equal(r.metrics.overflowObserved, null);
});
test('operation-only merge permission does not exclude the whole L3 skill', () => {
  const r = scope([skill('flow', { risk: 'L3', operationGates: { merge: { requiredPermissions: ['merge'] } } })]);
  assert.equal(r.candidates.length, 1); assert.equal(r.candidates[0].state, 'RESTRICTED');
  assert.deepEqual(r.candidates[0].operationGates.merge.requiredPermissions, ['merge']);
});
test('duplicate IDs fail closed regardless of input order', () => {
  const a = skill('same'), b = skill('same', { description: 'different' });
  assert.deepEqual(scope([a, b]), scope([b, a])); assert.equal(scope([a, b]).candidates.length, 0);
});
test('large irrelevant library does not alter relevant candidates', () => {
  const relevant = skill(); const many = Array.from({ length: 1000 }, (_, i) => skill('irrelevant-' + i, { project_scope: 'other' }));
  assert.deepEqual(scope([relevant, ...many]).candidates, scope([relevant]).candidates);
});
test('long UTF-8 descriptions affect budget accounting', () => {
  const r = scope([skill('long', { description: '한'.repeat(100) })]);
  assert.equal(r.budget.descriptionBytes, 300); assert.equal(r.budget.descriptionCharacters, 100);
});
test('explicit priority beats alphabetical truncation and order is stable', () => {
  const p = project({ policy: { enabledSkillIds: ['z'], maxCandidates: 1 } });
  assert.deepEqual(scope([skill('a'), skill('z')], p), scope([skill('z'), skill('a')], p));
  assert.deepEqual(scope([skill('a'), skill('z')], p).candidates.map(s => s.skill_id), ['z']);
});
test('observed overflow blocks acceptance, unknown limit is never invented', () => {
  const r = scope([skill()], project({ budgetSignal: { overflowObserved: true } }));
  assert.equal(r.budget.status, 'BLOCKED_OVERFLOW'); assert.equal(r.metrics.overflowObserved, true);
});
test('runtime requirements and exclusion are fail closed', () => {
  assert.equal(scope([skill('x', { runtime_exclusions: { 'claude-code': { reason: 'unsupported' } } })]).candidates.length, 0);
  assert.equal(scope([skill('x', { runtime_support: { 'claude-code': { status: 'SUPPORTED_WITH_RESTRICTIONS', requires_at_runtime: [{ kind: 'tool', id: 'absent' }] } } })]).candidates.length, 0);
});

for (const [name, s, p, conflicts, reason] of [
  ['operation-only permission', skill('flow', { risk: 'L3', operationGates: { merge: { requiredPermissions: ['merge'] } } }), project({ requestedOperations: ['merge'] }), [], 'OPERATION_MISSING_PERMISSION'],
  ['protected operation', skill(), project({ policy: { deniedOperations: ['write'], protectedResources: ['repo'] }, requestedOperations: ['write'], targetResources: ['repo'] }), [], 'PROJECT_POLICY'],
  ['task-selected conflict', skill(), project({ selectedSkillIds: ['other'] }), [['relevant', 'other']], 'CONFLICTING_SKILL'],
]) test(`startup does not apply ${name}; task evaluator still blocks`, () => {
  const result = scopeProject({ registry: { skills: [s] }, project: p, conflicts });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].state, s.risk === 'L3' ? 'RESTRICTED' : 'CANDIDATE');
  const task = { ...p, platform: p.runtime, project: p.project_scope, autoInvoke: true, explicitIntent: false, hasPermission: false };
  assert.equal(evaluateEligibility({ skill: s, task, conflicts, projectPolicy: p.policy }).reasonCode, reason);
});

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ush-scope-'));
  // Verify cleanup target is the exact disposable fixture we created.
  t.after(() => { assert.equal(path.dirname(root), os.tmpdir()); assert.ok(path.basename(root).startsWith('ush-scope-')); fs.rmSync(root, { recursive: true, force: true }); });
  const source = path.join(root, 'source'), target = path.join(root, 'project');
  fs.mkdirSync(source); fs.mkdirSync(target);
  const body = '---\nname: relevant\ndescription: Inspect evidence\n---\nRead only.\n';
  fs.mkdirSync(path.join(source, 'relevant')); fs.writeFileSync(path.join(source, 'relevant/SKILL.md'), body);
  const skills = [skill('relevant', { path: 'relevant', content_sha256: digest(Buffer.from(body)) })];
  const run = (extra = {}) => reconcileProject({ sourceRoot: source, targetRoot: target, registry: { skills }, project: project(), apply: true, ...extra });
  return { source, target, skills, run, file: path.join(target, '.claude/skills/relevant/SKILL.md') };
}
test('small candidate set materializes only candidates with canonical bytes', t => {
  const f = fixture(t); const r = f.run(); assert.equal(r.metrics.materializedHubSkills, 1); assert.equal(digest(fs.readFileSync(f.file)), f.skills[0].content_sha256);
});
test('oversized synthetic Hub never copies the entire library', t => {
  const f = fixture(t); f.skills.push(...Array.from({ length: 500 }, (_, i) => skill('other-' + i, { project_scope: 'other' })));
  f.run(); assert.deepEqual(fs.readdirSync(path.dirname(path.dirname(f.file))), ['relevant']);
});
test('unmanaged same-name skill is untouched and prevents adoption', t => {
  const f = fixture(t); fs.mkdirSync(path.dirname(f.file), { recursive: true }); fs.writeFileSync(f.file, 'user content');
  assert.throws(() => f.run(), /UNMANAGED/); assert.equal(fs.readFileSync(f.file, 'utf8'), 'user content');
});
test('managed stale skill safely updates with exact old receipt hash', t => {
  const f = fixture(t); f.run(); const body = '---\nname: relevant\ndescription: Updated evidence\n---\nupdated canonical'; fs.writeFileSync(path.join(f.source, 'relevant/SKILL.md'), body); f.skills[0].content_sha256 = digest(Buffer.from(body));
  f.run(); assert.equal(fs.readFileSync(f.file, 'utf8'), body);
});
test('user-modified managed skill conflicts before writes', t => {
  const f = fixture(t); f.run(); fs.appendFileSync(f.file, 'local edit'); assert.throws(() => f.run(), /CONFLICT/); assert.ok(fs.readFileSync(f.file, 'utf8').endsWith('local edit'));
});
test('no-longer-eligible managed skill requires explicit removal confirmation', t => {
  const f = fixture(t); f.run(); const p = project({ policy: { blockedSkillIds: ['relevant'] } });
  assert.throws(() => f.run({ project: p }), /REMOVAL_CONFIRMATION/); assert.ok(fs.existsSync(f.file));
  f.run({ project: p, confirmRemoval: true }); assert.equal(fs.existsSync(f.file), false);
});
test('unrelated unmanaged skill survives install and reconciliation', t => {
  const f = fixture(t); const dir = path.join(f.target, '.claude/skills/user'); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'SKILL.md'), 'mine');
  assert.equal(f.run().metrics.unmanagedPreserved, 1); f.run(); assert.equal(fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8'), 'mine');
});
test('canonical integrity failure leaves target absent', t => {
  const f = fixture(t); f.skills[0].content_sha256 = '0'.repeat(64);
  assert.throws(() => f.run(), /CANONICAL_INTEGRITY/); assert.equal(fs.existsSync(f.file), false);
});
test('added user files in a managed directory prevent removal', t => {
  const f = fixture(t); f.run(); fs.writeFileSync(path.join(path.dirname(f.file), 'notes.txt'), 'mine');
  assert.throws(() => f.run({ project: project({ policy: { denyAll: true } }), confirmRemoval: true }), /CONFLICT_EXTRA_FILES/);
  assert.ok(fs.existsSync(f.file));
});
test('materializer accounts canonical description even without registry description', t => {
  const f = fixture(t); delete f.skills[0].description;
  const result = f.run({ project: project({ policy: { maxDescriptionBytes: 1 } }) });
  assert.equal(result.metrics.budgetExcluded, 1); assert.equal(fs.existsSync(f.file), false);
});
test('missing project-wide permission excluded but deprecated high-risk cannot become restricted', () => {
  assert.equal(scope([skill('flow', { required_permissions: ['github_write'] })]).metrics.requirementsExcluded, 1);
  assert.equal(scope([skill('old', { risk: 'L3', status: 'DEPRECATED' })]).candidates.length, 0);
});
test('unknown descriptions cannot masquerade as zero-cost candidates', () => {
  const s = skill(); delete s.description;
  assert.equal(scope([s]).metrics.budgetExcluded, 1);
});
test('malformed context and observation types are refused', () => {
  assert.throws(() => scope([skill()], project({ grantedPermissions: 'merge' })), /INVALID_PROJECT_CONTEXT/);
  assert.throws(() => scope([skill()], project({ budgetSignal: { overflowObserved: 'false' } })), /INVALID_BUDGET_SIGNAL/);
});
test('string removal confirmation is not authorization', t => {
  const f = fixture(t); f.run();
  assert.throws(() => f.run({ project: project({ policy: { denyAll: true } }), confirmRemoval: 'false' }), /INVALID_CONFIRMATION/);
  assert.ok(fs.existsSync(f.file));
});
test('unknown project policy fields cannot silently bypass denials', () => {
  assert.throws(() => scope([skill()], project({ policy: { blockedSkills: ['relevant'] } })), /UNKNOWN_PROJECT_POLICY/);
});
test('missing canonical description fails closed before placement', t => {
  const f = fixture(t); const body = '---\nname: relevant\n---\nDo something.\n';
  fs.writeFileSync(path.join(f.source, 'relevant/SKILL.md'), body); f.skills[0].content_sha256 = digest(Buffer.from(body));
  assert.throws(() => f.run(), /INVALID_CANONICAL_METADATA/); assert.equal(fs.existsSync(f.file), false);
});
test('extra user file arriving during lock acquisition blocks removal before unlink', t => {
  const f = fixture(t); f.run(); const open = fs.openSync;
  t.mock.method(fs, 'openSync', (...args) => {
    const fd = open(...args);
    if (String(args[0]).endsWith('.ush-project-scope.lock')) fs.writeFileSync(path.join(path.dirname(f.file), 'user.txt'), 'mine');
    return fd;
  });
  assert.throws(() => f.run({ project: project({ policy: { denyAll: true } }), confirmRemoval: true }), /CONFLICT_EXTRA_FILES/);
  assert.ok(fs.existsSync(f.file));
});
test('receipt write failure rolls back exact previous skill bytes', t => {
  const f = fixture(t); f.run(); const original = fs.readFileSync(f.file);
  const body = '---\nname: relevant\ndescription: Updated evidence plan\n---\nUpdated.\n';
  fs.writeFileSync(path.join(f.source, 'relevant/SKILL.md'), body); f.skills[0].content_sha256 = digest(Buffer.from(body));
  const write = fs.writeFileSync;
  t.mock.method(fs, 'writeFileSync', (file, ...args) => {
    if (String(file).includes('.ush-project-scope.json')) throw new Error('INJECTED_RECEIPT_IO');
    return write(file, ...args);
  });
  assert.throws(() => f.run(), /INJECTED_RECEIPT_IO/);
  assert.deepEqual(fs.readFileSync(f.file), original);
});
test('failed first atomic write does not leave an unmanaged empty skill directory', t => {
  const f = fixture(t); const write = fs.writeFileSync;
  t.mock.method(fs, 'writeFileSync', (file, ...args) => {
    if (String(file).includes('SKILL.md.ush-tmp-')) throw new Error('INJECTED_BODY_IO');
    return write(file, ...args);
  });
  assert.throws(() => f.run(), /INJECTED_BODY_IO/);
  assert.equal(fs.existsSync(path.dirname(f.file)), false);
});
test('unknown skill scope is excluded rather than promoted to global', () => {
  assert.equal(scope([skill('bad', { scope: 'domian' })]).candidates.length, 0);
});
test('an existing transaction journal blocks retry without deleting evidence', t => {
  const f = fixture(t); const file = path.join(f.target, '.claude/.ush-project-scope.pending.json');
  fs.mkdirSync(path.dirname(file)); fs.writeFileSync(file, '{"version":1}');
  assert.throws(() => f.run(), /RECOVERY_REQUIRED/); assert.ok(fs.existsSync(file));
});
test('supporting files are refused before any target write', t => {
  const f = fixture(t); fs.writeFileSync(path.join(f.source, 'relevant/helper.py'), 'print(1)');
  assert.throws(() => f.run(), /UNSUPPORTED_SUPPORTING_FILES/); assert.equal(fs.existsSync(f.file), false);
});
test('symlink redirection preserves the file outside the project target', t => {
  const f = fixture(t); const outside = path.join(f.source, 'outside'); fs.mkdirSync(outside); fs.writeFileSync(path.join(outside, 'SKILL.md'), 'mine');
  fs.mkdirSync(path.dirname(path.dirname(f.file)), { recursive: true });
  fs.symlinkSync(outside, path.dirname(f.file), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => f.run(), /SYMLINK/); assert.equal(fs.readFileSync(path.join(outside, 'SKILL.md'), 'utf8'), 'mine');
});
test('source path traversal is rejected', t => {
  const f = fixture(t); f.skills[0].path = '../outside'; assert.throws(() => f.run(), /PATH_ESCAPE/);
});
test('concurrent project lock prevents writes', t => {
  const f = fixture(t); f.run(); const original = fs.readFileSync(f.file);
  const lock = path.join(f.target, '.claude/.ush-project-scope.lock'); fs.writeFileSync(lock, 'other reconciler');
  assert.throws(() => f.run(), /EEXIST/); assert.deepEqual(fs.readFileSync(f.file), original); assert.ok(fs.existsSync(lock));
});
