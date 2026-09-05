import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateEligibility } from '../eligibility.mjs';

const baseSkill = {
  skill_id: 'ush-example-skill',
  status: 'VALIDATED',
  risk: 'L0',
  platforms: ['codex', 'claude-code'],
};

test('Test H: an L4 skill requested for automatic invocation is BLOCKed', () => {
  const result = evaluateEligibility({
    skill: { ...baseSkill, risk: 'L4' },
    task: { platform: 'codex', autoInvoke: true },
  });
  assert.equal(result.decision, 'BLOCK');
  assert.ok(result.reasons.some((r) => r.includes('L4')));
});

test('an L4 skill explicitly confirmed by a human (not auto-invoked) is not BLOCKed by the L4 rule', () => {
  const result = evaluateEligibility({
    skill: { ...baseSkill, risk: 'L4' },
    task: { platform: 'codex', autoInvoke: false },
  });
  assert.notEqual(result.decision, 'BLOCK');
});

test('a QUARANTINED skill is always BLOCKed regardless of risk or invocation mode', () => {
  const result = evaluateEligibility({
    skill: { ...baseSkill, status: 'QUARANTINED' },
    task: { platform: 'codex', autoInvoke: false },
  });
  assert.equal(result.decision, 'BLOCK');
});

test('a DEPRECATED skill is SKIPped by default', () => {
  const result = evaluateEligibility({
    skill: { ...baseSkill, status: 'DEPRECATED' },
    task: { platform: 'codex', autoInvoke: false },
  });
  assert.equal(result.decision, 'SKIP');
});

test('a skill requested on a platform it does not list support for is BLOCKed', () => {
  const result = evaluateEligibility({
    skill: baseSkill,
    task: { platform: 'cursor', autoInvoke: false },
  });
  assert.equal(result.decision, 'BLOCK');
  assert.ok(result.reasons.some((r) => r.includes('platform')));
});

test('an eligible L0/VALIDATED skill on a supported platform is USE', () => {
  const result = evaluateEligibility({
    skill: baseSkill,
    task: { platform: 'codex', autoInvoke: true },
  });
  assert.equal(result.decision, 'USE');
});
