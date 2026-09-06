import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isApprovalValid } from '../approval-gate.mjs';

test('approval is valid when the current content hash matches the approved content hash', () => {
  const hash = 'abc123';
  assert.equal(isApprovalValid({ approvedContentHash: hash, currentContentHash: hash }), true);
});

test('approval is invalid when the content changed after approval (a material edit)', () => {
  assert.equal(isApprovalValid({ approvedContentHash: 'abc123', currentContentHash: 'def456' }), false);
});

test('approval is invalid when nothing has been approved yet', () => {
  assert.equal(isApprovalValid({ approvedContentHash: null, currentContentHash: 'def456' }), false);
});
