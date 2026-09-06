import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSkillDir, validateAllSkills, isValidSemVer } from '../validate-hub.mjs';

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

test('YAML parsing itself still handles nesting/lists correctly (js-yaml, not the naive line parser) even though the spec forbids nested metadata values', () => {
  // Distinct from spec-compliance: this only proves the YAML parser used by
  // validate-hub.mjs can read a nested structure at all (rather than a
  // regex-based parser choking on it) — the spec-compliance rejection of
  // that structure once parsed is covered separately below.
  const result = validateSkillDir(path.join(FIXTURES, 'invalid-metadata-nested', 'ush-bad-metadata-nested'));
  assert.equal(result.valid, false, 'the structure must parse (not crash) but still fail spec validation');
  assert.ok(result.errors.some((e) => e.toLowerCase().includes('metadata')), `expected a metadata error, got: ${JSON.stringify(result.errors)}`);
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

// --- strict SemVer 2.0 compliance (the official semver.org regex), not an
// approximate hand-rolled pattern ---

test('isValidSemVer accepts every valid SemVer 2.0 example from the spec', () => {
  for (const v of ['0.1.0', '1.0.0', '1.2.3-alpha', '1.2.3-alpha.1', '1.2.3+build.5', '1.2.3-alpha.1+build.5']) {
    assert.ok(isValidSemVer(v), `expected "${v}" to be accepted as valid SemVer`);
  }
});

test('isValidSemVer rejects every invalid example (leading zeros, empty identifiers, trailing +)', () => {
  for (const v of ['01.2.3', '1.02.3', '1.2.03', '1.0.0-alpha..1', '1.0.0-01', '1.0.0+']) {
    assert.equal(isValidSemVer(v), false, `expected "${v}" to be rejected as invalid SemVer`);
  }
});

test('a metadata.scope value outside the hub\'s supported scopes is rejected', () => {
  const result = validateSkillDir(path.join(FIXTURES, 'invalid-scope', 'ush-bad-scope'));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('scope')), `expected a scope error, got: ${JSON.stringify(result.errors)}`);
});

// --- Agent Skills spec compliance: `compatibility` is a 1-500 char STRING,
// `metadata` is a flat string-to-string map — verified against the
// cross-vendor spec at agentskills.io/specification (checked 2026-09-05).
// registry/compatibility.json is a separate, Hub-owned, structured file and
// is unaffected by these rules — they apply only to SKILL.md frontmatter.

test('a spec-compliant string compatibility field is accepted', () => {
  const result = validateSkillDir(path.join(FIXTURES, 'valid-compatibility-string', 'ush-good-compat-string'));
  assert.equal(result.valid, true, `expected valid, got errors: ${JSON.stringify(result.errors)}`);
});

test('a compatibility field that is an object instead of a string is rejected', () => {
  const result = validateSkillDir(path.join(FIXTURES, 'invalid-compatibility', 'ush-bad-compat'));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.toLowerCase().includes('compatibility') && e.toLowerCase().includes('string')), `expected a compatibility-must-be-a-string error, got: ${JSON.stringify(result.errors)}`);
});

test('an empty compatibility string is rejected', () => {
  const result = validateSkillDir(path.join(FIXTURES, 'invalid-compatibility-empty', 'ush-bad-compat-empty'));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.toLowerCase().includes('compatibility')), `expected a compatibility error, got: ${JSON.stringify(result.errors)}`);
});

test('a compatibility string over 500 characters is rejected', () => {
  const result = validateSkillDir(path.join(FIXTURES, 'invalid-compatibility-too-long', 'ush-bad-compat-long'));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('500')), `expected a 500-char limit error, got: ${JSON.stringify(result.errors)}`);
});

test('a spec-compliant flat string-to-string metadata map is accepted', () => {
  const result = validateSkillDir(path.join(FIXTURES, 'valid-metadata-stringmap', 'ush-good-metadata-stringmap'));
  assert.equal(result.valid, true, `expected valid, got errors: ${JSON.stringify(result.errors)}`);
});

test('a metadata value that is a nested object (not a string) is rejected', () => {
  const result = validateSkillDir(path.join(FIXTURES, 'invalid-metadata-nested', 'ush-bad-metadata-nested'));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.toLowerCase().includes('metadata') && e.toLowerCase().includes('string')), `expected a metadata-must-be-string-values error, got: ${JSON.stringify(result.errors)}`);
});

test('a metadata value that is a number (not a string) is rejected', () => {
  const result = validateSkillDir(path.join(FIXTURES, 'invalid-metadata-numeric', 'ush-bad-metadata-numeric'));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.toLowerCase().includes('metadata') && e.toLowerCase().includes('string')), `expected a metadata-must-be-string-values error, got: ${JSON.stringify(result.errors)}`);
});

// --- remaining Agent Skills optional-field type gaps (final micro-fix round) ---

test('a description value that is a number (not a string) is rejected, even though String(...) would coerce it to a length-valid value', () => {
  const result = validateSkillDir(path.join(FIXTURES, 'invalid-description-type', 'ush-bad-desc-type'));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.toLowerCase().includes('description') && e.toLowerCase().includes('string')), `expected a description-must-be-a-string error, got: ${JSON.stringify(result.errors)}`);
});

test('allowed-tools given as a YAML list instead of a space-separated string is rejected', () => {
  const result = validateSkillDir(path.join(FIXTURES, 'invalid-allowed-tools-list', 'ush-bad-tools-list'));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.toLowerCase().includes('allowed-tools')), `expected an allowed-tools error, got: ${JSON.stringify(result.errors)}`);
});

test('a spec-compliant space-separated allowed-tools string is accepted', () => {
  const result = validateSkillDir(path.join(FIXTURES, 'valid-allowed-tools-string', 'ush-good-tools-string'));
  assert.equal(result.valid, true, `expected valid, got errors: ${JSON.stringify(result.errors)}`);
});
