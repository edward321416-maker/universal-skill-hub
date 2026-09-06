import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { checkConsistency } from '../registry-consistency.mjs';

const canonicalContent = `---
name: ush-example-skill
description: A minimal valid fixture skill used only by validator tests.
metadata:
  type: global
  scope: global
  risk: L0
  status: EXPERIMENTAL
  version: 0.1.0
---

# Example Skill
`;

const correctHash = crypto.createHash('sha256').update(canonicalContent).digest('hex');

const goodRegistryEntry = {
  skill_id: 'ush-example-skill',
  version: '0.1.0',
  scope: 'global',
  risk: 'L0',
  status: 'EXPERIMENTAL',
  content_sha256: correctHash,
};

test('a registry entry that matches its canonical source on every owned field is consistent', () => {
  const result = checkConsistency({ registryEntry: goodRegistryEntry, canonicalContent });
  assert.equal(result.consistent, true, `expected consistent, got errors: ${JSON.stringify(result.errors)}`);
});

test('a registry version that no longer matches the canonical metadata.version is FAIL', () => {
  const result = checkConsistency({ registryEntry: { ...goodRegistryEntry, version: '9.9.9' }, canonicalContent });
  assert.equal(result.consistent, false);
  assert.ok(result.errors.some((e) => e.includes('version')));
});

test('a registry content_sha256 that no longer matches the canonical file content is FAIL', () => {
  const result = checkConsistency({ registryEntry: { ...goodRegistryEntry, content_sha256: 'stale'.repeat(16) }, canonicalContent });
  assert.equal(result.consistent, false);
  assert.ok(result.errors.some((e) => e.includes('content_sha256') || e.includes('hash')));
});

test('a registry skill_id that no longer matches the canonical frontmatter name is FAIL', () => {
  const result = checkConsistency({ registryEntry: { ...goodRegistryEntry, skill_id: 'ush-renamed' }, canonicalContent });
  assert.equal(result.consistent, false);
  assert.ok(result.errors.some((e) => e.includes('skill_id') || e.includes('name')));
});

test('a bundle_targets status outside SUPPORTED|SUPPORTED_WITH_RESTRICTIONS|UNSUPPORTED is FAIL', () => {
  const result = checkConsistency({
    registryEntry: { ...goodRegistryEntry, bundle_targets: { 'claude-ai': { status: 'MOSTLY_FINE_PROBABLY', reason: 'x' } } },
    canonicalContent,
  });
  assert.equal(result.consistent, false);
  assert.ok(result.errors.some((e) => e.includes('bundle_targets') && e.includes('claude-ai')));
});

test('a bundle_targets entry with a valid status enum value and a reason is consistent', () => {
  const result = checkConsistency({
    registryEntry: { ...goodRegistryEntry, bundle_targets: { 'claude-ai': { status: 'SUPPORTED', reason: 'x' } } },
    canonicalContent,
  });
  assert.equal(result.consistent, true, `expected consistent, got errors: ${JSON.stringify(result.errors)}`);
});

test('a bundle_targets entry with no reason is FAIL — a support/restriction/unsupported claim must be machine-readable AND explained', () => {
  const result = checkConsistency({
    registryEntry: { ...goodRegistryEntry, bundle_targets: { 'claude-ai': { status: 'UNSUPPORTED' } } },
    canonicalContent,
  });
  assert.equal(result.consistent, false);
  assert.ok(result.errors.some((e) => e.includes('reason')));
});
