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

test('an L4 skill explicitly confirmed by a human (not auto-invoked, informed confirmation given) is not BLOCKed by the L4 rule', () => {
  const result = evaluateEligibility({
    skill: { ...baseSkill, risk: 'L4' },
    task: { platform: 'codex', autoInvoke: false, informedConfirmation: true },
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

test('an L3 skill invoked without explicit intent is BLOCKed', () => {
  const result = evaluateEligibility({
    skill: { ...baseSkill, risk: 'L3' },
    task: { platform: 'codex', autoInvoke: false, explicitIntent: false, hasPermission: true },
  });
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.reasonCode, 'L3_NO_EXPLICIT_INTENT');
});

test('an L3 skill invoked without permission is BLOCKed', () => {
  const result = evaluateEligibility({
    skill: { ...baseSkill, risk: 'L3' },
    task: { platform: 'codex', autoInvoke: false, explicitIntent: true, hasPermission: false },
  });
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.reasonCode, 'L3_NO_PERMISSION');
});

test('an EXPERIMENTAL L3 skill auto-invoked is BLOCKed even with intent and permission', () => {
  const result = evaluateEligibility({
    skill: { ...baseSkill, risk: 'L3', status: 'EXPERIMENTAL' },
    task: { platform: 'codex', autoInvoke: true, explicitIntent: true, hasPermission: true },
  });
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.reasonCode, 'EXPERIMENTAL_L3_AUTO');
});

test('a VALIDATED L3 skill with explicit intent and permission, not auto-invoked, is USE', () => {
  const result = evaluateEligibility({
    skill: { ...baseSkill, risk: 'L3', status: 'VALIDATED' },
    task: { platform: 'codex', autoInvoke: false, explicitIntent: true, hasPermission: true },
  });
  assert.equal(result.decision, 'USE');
});

test('an L4 skill invoked without informed confirmation is BLOCKed even when not auto-invoked', () => {
  const result = evaluateEligibility({
    skill: { ...baseSkill, risk: 'L4' },
    task: { platform: 'codex', autoInvoke: false, informedConfirmation: false },
  });
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.reasonCode, 'L4_NO_INFORMED_CONFIRMATION');
});

test('an L4 skill with informed confirmation and not auto-invoked is USE', () => {
  const result = evaluateEligibility({
    skill: { ...baseSkill, risk: 'L4' },
    task: { platform: 'codex', autoInvoke: false, informedConfirmation: true },
  });
  assert.equal(result.decision, 'USE');
});

test('a skill that would use a forbidden capability is BLOCKed', () => {
  const result = evaluateEligibility({
    skill: { ...baseSkill, forbidden_capabilities: ['network_write'] },
    task: { platform: 'codex', autoInvoke: false, capabilitiesUsed: ['network_write'] },
  });
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.reasonCode, 'FORBIDDEN_CAPABILITY');
});

test('a skill with a forbidden capability declared, but not actually used by the task, is not BLOCKed for that reason', () => {
  const result = evaluateEligibility({
    skill: { ...baseSkill, forbidden_capabilities: ['network_write'] },
    task: { platform: 'codex', autoInvoke: false, capabilitiesUsed: ['read_files'] },
  });
  assert.notEqual(result.reasonCode, 'FORBIDDEN_CAPABILITY');
});

test('two skills declared conflicting in the registry cannot both be selected for the same task', () => {
  const conflicts = [['ush-example-skill', 'ush-other-skill']];
  const result = evaluateEligibility({
    skill: baseSkill,
    task: { platform: 'codex', autoInvoke: false, selectedSkillIds: ['ush-other-skill'] },
    conflicts,
  });
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.reasonCode, 'CONFLICTING_SKILL');
});

test('project policy explicitly blocking a skill overrides an otherwise-eligible global skill', () => {
  const result = evaluateEligibility({
    skill: baseSkill,
    task: { platform: 'codex', autoInvoke: false },
    projectPolicy: { blockedSkillIds: ['ush-example-skill'], reason: 'FINAL CHECK frozen validator policy' },
  });
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.reasonCode, 'PROJECT_POLICY');
  assert.ok(result.reasons.some((r) => r.includes('FINAL CHECK')));
});
