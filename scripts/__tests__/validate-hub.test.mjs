import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSkillDir, validateAllSkills } from '../validate-hub.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, 'fixtures');

test('Test A: valid canonical skill is accepted', () => {
  const result = validateSkillDir(path.join(FIXTURES, 'valid-skill', 'ush-example-skill'));
  assert.equal(result.valid, true, `expected valid, got errors: ${JSON.stringify(result.errors)}`);
  assert.deepEqual(result.errors, []);
});

test('Test B: invalid name (dot namespace, uppercase) is rejected', () => {
  const result = validateSkillDir(path.join(FIXTURES, 'invalid-name', 'global.systematic-debugging'));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('name')), `expected a name error, got: ${JSON.stringify(result.errors)}`);
});

test('Test C: directory name mismatched with frontmatter name is rejected', () => {
  const result = validateSkillDir(path.join(FIXTURES, 'dir-mismatch', 'ush-repo-evidence-plan'));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('directory') || e.includes('match')), `expected mismatch error, got: ${JSON.stringify(result.errors)}`);
});

test('Test D: missing description is rejected', () => {
  const result = validateSkillDir(path.join(FIXTURES, 'missing-description', 'ush-no-description'));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('description')), `expected description error, got: ${JSON.stringify(result.errors)}`);
});

test('Test E: duplicate skill id across the hub is rejected', () => {
  const result = validateAllSkills(path.join(FIXTURES, 'duplicate-ids'));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('duplicate')), `expected duplicate error, got: ${JSON.stringify(result.errors)}`);
});

test('Test F: project-bound skill exposed as global scope is rejected', () => {
  const result = validateSkillDir(path.join(FIXTURES, 'project-leak', 'ush-project-leak'));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('project') || e.includes('scope')), `expected scope conflict error, got: ${JSON.stringify(result.errors)}`);
});

test('a 65-character name (one over the Agent Skills limit) is rejected', () => {
  const result = validateSkillDir(path.join(FIXTURES, 'name-too-long', 'ush-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('64')), `expected a length error, got: ${JSON.stringify(result.errors)}`);
});

test('a name with consecutive hyphens is rejected', () => {
  const result = validateSkillDir(path.join(FIXTURES, 'consecutive-hyphen', 'ush-foo--bar'));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('consecutive') || e.includes('--')), `expected a consecutive-hyphen error, got: ${JSON.stringify(result.errors)}`);
});

test('a description over 1024 characters is rejected', () => {
  const result = validateSkillDir(path.join(FIXTURES, 'description-too-long', 'ush-desc-too-long'));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('1024')), `expected a description-length error, got: ${JSON.stringify(result.errors)}`);
});

test('malformed YAML frontmatter is rejected with a clear error, not a crash', () => {
  const result = validateSkillDir(path.join(FIXTURES, 'malformed-yaml', 'ush-malformed'));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.toLowerCase().includes('yaml') || e.toLowerCase().includes('frontmatter')), `expected a YAML/frontmatter error, got: ${JSON.stringify(result.errors)}`);
});

test('a quoted YAML description containing a colon is parsed correctly and accepted', () => {
  const result = validateSkillDir(path.join(FIXTURES, 'quoted-yaml', 'ush-quoted-desc'));
  assert.equal(result.valid, true, `expected valid, got errors: ${JSON.stringify(result.errors)}`);
});

test('metadata nested deeper than one level (with a list value) is parsed correctly and accepted', () => {
  const result = validateSkillDir(path.join(FIXTURES, 'nested-metadata', 'ush-nested-ok'));
  assert.equal(result.valid, true, `expected valid, got errors: ${JSON.stringify(result.errors)}`);
});

test('a metadata.status value outside EXPERIMENTAL|VALIDATED|DEPRECATED|QUARANTINED is rejected', () => {
  const result = validateSkillDir(path.join(FIXTURES, 'invalid-status', 'ush-bad-status'));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('status')), `expected a status error, got: ${JSON.stringify(result.errors)}`);
});

test('a metadata.risk value outside L0-L4 is rejected', () => {
  const result = validateSkillDir(path.join(FIXTURES, 'invalid-risk', 'ush-bad-risk'));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('risk')), `expected a risk error, got: ${JSON.stringify(result.errors)}`);
});

test('a metadata.version that is not valid SemVer is rejected', () => {
  const result = validateSkillDir(path.join(FIXTURES, 'invalid-semver', 'ush-bad-semver'));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.toLowerCase().includes('semver') || e.toLowerCase().includes('version')), `expected a version error, got: ${JSON.stringify(result.errors)}`);
});

test('a metadata.scope value outside the hub\'s supported scopes is rejected', () => {
  const result = validateSkillDir(path.join(FIXTURES, 'invalid-scope', 'ush-bad-scope'));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('scope')), `expected a scope error, got: ${JSON.stringify(result.errors)}`);
});

test('an optional frontmatter compatibility block with the wrong field type is rejected', () => {
  const result = validateSkillDir(path.join(FIXTURES, 'invalid-compatibility', 'ush-bad-compat'));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.toLowerCase().includes('compatibility')), `expected a compatibility error, got: ${JSON.stringify(result.errors)}`);
});
