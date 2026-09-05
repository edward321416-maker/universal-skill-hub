import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { computeInstallPath, classifyExisting, planInstall } from '../install-skills.mjs';

test('computeInstallPath for claude-code user scope uses a stable home-relative path, not a project checkout path', () => {
  const p = computeInstallPath({ platform: 'claude-code', scope: 'user', skillId: 'ush-example-skill', homeDir: 'C:\\Users\\admin' });
  assert.equal(p, path.join('C:\\Users\\admin', '.claude', 'skills', 'ush-example-skill', 'SKILL.md'));
});

test('computeInstallPath for claude-code project scope is relative to the given project root', () => {
  const p = computeInstallPath({ platform: 'claude-code', scope: 'project', skillId: 'ush-example-skill', projectRoot: 'D:\\some\\project' });
  assert.equal(p, path.join('D:\\some\\project', '.claude', 'skills', 'ush-example-skill', 'SKILL.md'));
});

test('computeInstallPath refuses to embed a caller-supplied project checkout path into a user-scope install', () => {
  assert.throws(() => {
    computeInstallPath({ platform: 'claude-code', scope: 'user', skillId: 'ush-example-skill', homeDir: 'C:\\Users\\admin', projectRoot: 'D:\\some\\project' });
  }, /project/i);
});

test('classifyExisting: no existing file is "not_installed"', () => {
  const result = classifyExisting({ existingContent: null, expectedContent: 'anything' });
  assert.equal(result, 'not_installed');
});

test('classifyExisting: existing file has no GENERATED marker at all -> "unmanaged"', () => {
  const result = classifyExisting({ existingContent: 'a hand-written SKILL.md a user made themselves', expectedContent: 'GENERATED — DO NOT EDIT\n...' });
  assert.equal(result, 'unmanaged');
});

test('classifyExisting: existing file matches the expected render exactly -> "managed_current"', () => {
  const content = 'GENERATED — DO NOT EDIT\nsame content';
  const result = classifyExisting({ existingContent: content, expectedContent: content });
  assert.equal(result, 'managed_current');
});

test('classifyExisting: existing file has the marker but does not match the expected render -> "managed_stale"', () => {
  const result = classifyExisting({
    existingContent: 'GENERATED — DO NOT EDIT\nold rendered content',
    expectedContent: 'GENERATED — DO NOT EDIT\nnew rendered content',
  });
  assert.equal(result, 'managed_stale');
});

test('planInstall in dry-run mode (the default) never writes and reports the action it would take', () => {
  const plan = planInstall({
    skillId: 'ush-example-skill',
    platform: 'claude-code',
    scope: 'user',
    canonicalBody: 'body',
    render: () => ({ blocked: false, content: 'GENERATED — DO NOT EDIT\nbody' }),
    homeDir: 'C:\\Users\\admin',
    existingContent: null,
    apply: false,
  });
  assert.equal(plan.wouldWrite, true);
  assert.equal(plan.wrote, false);
  assert.equal(plan.classification, 'not_installed');
});

test('planInstall never overwrites an "unmanaged" existing file, even with apply:true', () => {
  const plan = planInstall({
    skillId: 'ush-example-skill',
    platform: 'claude-code',
    scope: 'user',
    canonicalBody: 'body',
    render: () => ({ blocked: false, content: 'GENERATED — DO NOT EDIT\nbody' }),
    homeDir: 'C:\\Users\\admin',
    existingContent: 'a file the user wrote by hand',
    apply: true,
  });
  assert.equal(plan.classification, 'unmanaged');
  assert.equal(plan.wouldWrite, false);
  assert.equal(plan.wrote, false);
  assert.ok(plan.reason.toLowerCase().includes('unmanaged'));
});
