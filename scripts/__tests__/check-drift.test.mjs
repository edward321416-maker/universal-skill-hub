import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { detectDrift } from '../check-drift.mjs';

const CANONICAL = 'canonical body line one\nline two\n';

test('Test I: no drift when generated adapter hash matches the current canonical hash', () => {
  const rendered = `<!--\nGENERATED — DO NOT EDIT\ncanonical_content_sha256: ${crypto.createHash('sha256').update(CANONICAL).digest('hex')}\n-->\n\n${CANONICAL}`;
  const result = detectDrift({ canonicalBody: CANONICAL, adapterContent: rendered });
  assert.equal(result.drifted, false);
});

test('Test I: drift detected when generated adapter hash does not match current canonical hash', () => {
  const staleHash = crypto.createHash('sha256').update('some older body').digest('hex');
  const rendered = `<!--\nGENERATED — DO NOT EDIT\ncanonical_content_sha256: ${staleHash}\n-->\n\n${CANONICAL}`;
  const result = detectDrift({ canonicalBody: CANONICAL, adapterContent: rendered });
  assert.equal(result.drifted, true);
});

test('Test I: drift detected when a generated adapter file has no embedded hash marker at all (manual edit stripped it)', () => {
  const result = detectDrift({ canonicalBody: CANONICAL, adapterContent: 'someone pasted content with no marker' });
  assert.equal(result.drifted, true);
  assert.ok(result.reason.includes('marker'));
});
