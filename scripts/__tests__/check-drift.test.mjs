import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectDrift } from '../check-drift.mjs';
import { renderAdapter } from '../render-adapters.mjs';

const CANONICAL = 'canonical body line one\nline two\n';
const RENDER_ARGS = {
  skillId: 'ush-example-skill',
  canonicalBody: CANONICAL,
  platform: 'codex',
  capabilities: { requires: [], requires_not: [] },
  sourceCommit: 'abc123',
};

test('Test I: an untouched generated adapter (matches a fresh render byte-for-byte) is not drifted', () => {
  const { content } = renderAdapter(RENDER_ARGS);
  const result = detectDrift({ ...RENDER_ARGS, adapterContent: content });
  assert.equal(result.drifted, false);
});

test('Test I: canonical source changed since the adapter was rendered is DRIFT', () => {
  const { content: staleAdapter } = renderAdapter(RENDER_ARGS);
  const result = detectDrift({ ...RENDER_ARGS, canonicalBody: 'a different canonical body\n', adapterContent: staleAdapter });
  assert.equal(result.drifted, true);
});

test('Test I: adapter body hand-edited while the marker/hash is left untouched is still DRIFT (full-render comparison, not marker-hash-only)', () => {
  const { content } = renderAdapter(RENDER_ARGS);
  const tampered = content + '\nsomeone appended an extra instruction here\n';
  const result = detectDrift({ ...RENDER_ARGS, adapterContent: tampered });
  assert.equal(result.drifted, true);
  assert.ok(result.reason.toLowerCase().includes('render'), `expected a render-mismatch reason, got: ${result.reason}`);
});

test('Test I: the GENERATED marker itself edited/stripped is DRIFT', () => {
  const result = detectDrift({ ...RENDER_ARGS, adapterContent: 'someone replaced the whole file with no marker at all' });
  assert.equal(result.drifted, true);
});

test('Test I: a missing generated adapter file is reported as MISSING/DRIFT by the CLI-facing helper', () => {
  const result = detectDrift({ ...RENDER_ARGS, adapterContent: null });
  assert.equal(result.drifted, true);
  assert.equal(result.reasonCode, 'MISSING');
});
