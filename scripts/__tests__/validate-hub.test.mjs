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
