import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getForbiddenCapabilities } from '../load-compatibility.mjs';

test('reads forbidden_capabilities from a compatibility entry using the current field name', () => {
  const result = getForbiddenCapabilities({ requires: [], forbidden_capabilities: ['shell_exec'] });
  assert.deepEqual(result, ['shell_exec']);
});

test('falls back to the deprecated requires_not field name for backward compatibility', () => {
  const result = getForbiddenCapabilities({ requires: [], requires_not: ['network_write'] });
  assert.deepEqual(result, ['network_write']);
});

test('prefers forbidden_capabilities over requires_not when both are present', () => {
  const result = getForbiddenCapabilities({ forbidden_capabilities: ['a'], requires_not: ['b'] });
  assert.deepEqual(result, ['a']);
});

test('returns an empty array when neither field is present', () => {
  const result = getForbiddenCapabilities({ requires: [] });
  assert.deepEqual(result, []);
});
