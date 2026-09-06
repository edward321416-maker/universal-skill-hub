import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Targeted regression guard for the specific safety-critical facts about
 * operationGates that docs/DESIGN.md got stale on once already (Phase 1.2
 * review round 2 caught it, round 3 fixed it): it stated that
 * requiresApprovedContentMatch was caller-tracked state living outside the
 * deterministic eligibility engine, when in fact evaluateEligibility()
 * checks it directly. This does not attempt to validate DESIGN.md's prose
 * generally — only these specific, safety-relevant architecture facts,
 * which are cheap to state precisely and expensive to get wrong silently.
 */
test('docs/DESIGN.md states that requiredPermissions is checked against task.grantedPermissions', () => {
  const doc = fs.readFileSync(path.join(process.cwd(), 'docs', 'DESIGN.md'), 'utf8');
  assert.ok(doc.includes('task.grantedPermissions'), 'expected docs/DESIGN.md to state that requiredPermissions is checked against task.grantedPermissions');
});

test('docs/DESIGN.md states that requiresApprovedContentMatch is checked inside evaluateEligibility itself (the deterministic engine), not by the caller', () => {
  const doc = fs.readFileSync(path.join(process.cwd(), 'docs', 'DESIGN.md'), 'utf8');
  assert.ok(
    doc.includes('checked **inside `evaluateEligibility` itself**') || doc.includes('checked inside evaluateEligibility itself'),
    'expected docs/DESIGN.md to state requiresApprovedContentMatch is checked inside evaluateEligibility itself'
  );
});

test('docs/DESIGN.md no longer contains the obsolete claim that approval matching "lives outside the deterministic eligibility engine"', () => {
  const doc = fs.readFileSync(path.join(process.cwd(), 'docs', 'DESIGN.md'), 'utf8');
  assert.ok(!doc.includes('lives outside the deterministic'), 'docs/DESIGN.md still contains the obsolete "lives outside the deterministic eligibility engine" claim');
});

test('docs/DESIGN.md no longer describes approval invalidation as purely "caller-tracked conversational state" the engine cannot check', () => {
  const doc = fs.readFileSync(path.join(process.cwd(), 'docs', 'DESIGN.md'), 'utf8');
  assert.ok(!doc.includes('caller-tracked conversational state'), 'docs/DESIGN.md still describes approval state as purely caller-tracked, outside what the engine can check');
});
