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

// --- Phase 1.1 review fixes: required input/tool/capability/permission, project scope, resource/operation-aware project policy ---

test('a skill requiring an input the task does not have available is BLOCKed with MISSING_INPUT', () => {
  const result = evaluateEligibility({
    skill: { ...baseSkill, required_inputs: ['repo_path'] },
    task: { platform: 'codex', autoInvoke: false, availableInputs: [] },
  });
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.reasonCode, 'MISSING_INPUT');
});

test('a skill requiring an input is USE when the task declares that input available', () => {
  const result = evaluateEligibility({
    skill: { ...baseSkill, required_inputs: ['repo_path'] },
    task: { platform: 'codex', autoInvoke: false, availableInputs: ['repo_path'] },
  });
  assert.equal(result.decision, 'USE');
});

test('a skill with a required input is BLOCKed (fail-closed) when the task does not even state availableInputs', () => {
  const result = evaluateEligibility({
    skill: { ...baseSkill, required_inputs: ['repo_path'] },
    task: { platform: 'codex', autoInvoke: false },
  });
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.reasonCode, 'MISSING_INPUT');
});

test('a skill requiring a tool the task does not have available is BLOCKed with MISSING_TOOL', () => {
  const result = evaluateEligibility({
    skill: { ...baseSkill, required_tools: ['grep'] },
    task: { platform: 'codex', autoInvoke: false, availableTools: ['read'] },
  });
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.reasonCode, 'MISSING_TOOL');
});

test('a skill requiring a host capability the task does not have available is BLOCKed with MISSING_CAPABILITY', () => {
  const result = evaluateEligibility({
    skill: { ...baseSkill, required_capabilities: ['network_read'] },
    task: { platform: 'codex', autoInvoke: false, availableCapabilities: [] },
  });
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.reasonCode, 'MISSING_CAPABILITY');
});

test('a skill requiring a permission the task was not granted is BLOCKed with MISSING_PERMISSION', () => {
  const result = evaluateEligibility({
    skill: { ...baseSkill, required_permissions: ['write_files'] },
    task: { platform: 'codex', autoInvoke: false, grantedPermissions: [] },
  });
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.reasonCode, 'MISSING_PERMISSION');
});

test('a project-scoped skill is SKIPped (not BLOCKed) for a task in a different project', () => {
  const result = evaluateEligibility({
    skill: { ...baseSkill, project_scope: 'one-rope' },
    task: { platform: 'codex', autoInvoke: false, project: 'decode' },
  });
  assert.equal(result.decision, 'SKIP');
  assert.equal(result.reasonCode, 'PROJECT_SCOPE_MISMATCH');
});

test('a project-scoped skill is USE for a task in the matching project', () => {
  const result = evaluateEligibility({
    skill: { ...baseSkill, project_scope: 'one-rope' },
    task: { platform: 'codex', autoInvoke: false, project: 'one-rope' },
  });
  assert.equal(result.decision, 'USE');
});

test('a global skill with no project_scope is USE regardless of task.project', () => {
  const result = evaluateEligibility({
    skill: baseSkill,
    task: { platform: 'codex', autoInvoke: false, project: 'anything' },
  });
  assert.equal(result.decision, 'USE');
});

test('project policy: a read-only operation on a protected resource is not blocked when only "modify" is denied', () => {
  const result = evaluateEligibility({
    skill: baseSkill,
    task: { platform: 'codex', autoInvoke: false, requestedOperations: ['read'], targetResources: ['validator'] },
    projectPolicy: { deniedOperations: ['modify'], protectedResources: ['validator'], reason: 'FINAL CHECK frozen validator' },
  });
  assert.equal(result.decision, 'USE');
});

test('project policy: a denied operation against a protected resource is BLOCKed even though the skill itself is not on any blockedSkillIds list', () => {
  const result = evaluateEligibility({
    skill: baseSkill,
    task: { platform: 'codex', autoInvoke: false, requestedOperations: ['modify'], targetResources: ['validator'] },
    projectPolicy: { deniedOperations: ['modify'], protectedResources: ['validator'], reason: 'FINAL CHECK frozen validator' },
  });
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.reasonCode, 'PROJECT_POLICY');
  assert.ok(result.reasons.some((r) => r.includes('FINAL CHECK')));
});

test('project policy: a denied operation against a resource that is NOT protected is not blocked by that policy', () => {
  const result = evaluateEligibility({
    skill: baseSkill,
    task: { platform: 'codex', autoInvoke: false, requestedOperations: ['modify'], targetResources: ['unrelated-file'] },
    projectPolicy: { deniedOperations: ['modify'], protectedResources: ['validator'] },
  });
  assert.equal(result.decision, 'USE');
});

// --- Phase 1.2: per-operation gates. Some L0 skills are read-only by
// default but have one specific operation (e.g. "send", "publish") that
// must be gated independently of the skill's overall risk tier — an L0
// analysis/drafting skill should not have to satisfy L3-style intent and
// permission checks just to do its default read-only job. ---

const gatedSkill = {
  skill_id: 'ush-gated-example',
  status: 'VALIDATED',
  risk: 'L0',
  platforms: ['codex', 'claude-code'],
  operationGates: {
    send: { requiredCapabilities: ['chat_send'], requiresExplicitIntent: true, requiresPermission: true },
  },
};

test('a gated skill performing only its default (ungated) operation is USE even without intent/permission/capability', () => {
  const result = evaluateEligibility({
    skill: gatedSkill,
    task: { platform: 'codex', autoInvoke: true, requestedOperations: ['read'] },
  });
  assert.equal(result.decision, 'USE');
});

test('a gated operation requested without explicit intent is BLOCKed', () => {
  const result = evaluateEligibility({
    skill: gatedSkill,
    task: { platform: 'codex', autoInvoke: false, requestedOperations: ['send'], explicitIntent: false, hasPermission: true, availableCapabilities: ['chat_send'] },
  });
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.reasonCode, 'OPERATION_NO_EXPLICIT_INTENT');
});

test('a gated operation requested without permission is BLOCKed', () => {
  const result = evaluateEligibility({
    skill: gatedSkill,
    task: { platform: 'codex', autoInvoke: false, requestedOperations: ['send'], explicitIntent: true, hasPermission: false, availableCapabilities: ['chat_send'] },
  });
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.reasonCode, 'OPERATION_NO_PERMISSION');
});

test('a gated operation requested without the required capability is BLOCKed (fail-closed on unstated capabilities)', () => {
  const result = evaluateEligibility({
    skill: gatedSkill,
    task: { platform: 'codex', autoInvoke: false, requestedOperations: ['send'], explicitIntent: true, hasPermission: true },
  });
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.reasonCode, 'OPERATION_MISSING_CAPABILITY');
});

test('a gated operation with explicit intent, permission, and the required capability is USE', () => {
  const result = evaluateEligibility({
    skill: gatedSkill,
    task: { platform: 'codex', autoInvoke: false, requestedOperations: ['send'], explicitIntent: true, hasPermission: true, availableCapabilities: ['chat_send'] },
  });
  assert.equal(result.decision, 'USE');
});

// --- Phase 1.2 review round 2: named per-operation permissions. A generic
// hasPermission:true boolean must NOT be sufficient on its own once a gate
// declares requiredPermissions — an unrelated permission grant must never
// authorize a specific gated operation like "send" or "merge". ---

const namedPermGatedSkill = {
  skill_id: 'ush-named-perm-example',
  status: 'VALIDATED',
  risk: 'L0',
  platforms: ['codex'],
  operationGates: {
    send: { requiredCapabilities: ['chat_send'], requiredPermissions: ['chat_send'], requiresExplicitIntent: true },
  },
};

test('a gate declaring requiredPermissions BLOCKs when hasPermission is true but the named permission was not actually granted', () => {
  const result = evaluateEligibility({
    skill: namedPermGatedSkill,
    task: {
      platform: 'codex',
      autoInvoke: false,
      requestedOperations: ['send'],
      explicitIntent: true,
      hasPermission: true, // generic "yes" grant — must not be enough on its own
      grantedPermissions: ['some_unrelated_permission'],
      availableCapabilities: ['chat_send'],
    },
  });
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.reasonCode, 'OPERATION_MISSING_PERMISSION');
});

test('a gate declaring requiredPermissions BLOCKs (fail-closed) when grantedPermissions is not even stated', () => {
  const result = evaluateEligibility({
    skill: namedPermGatedSkill,
    task: { platform: 'codex', autoInvoke: false, requestedOperations: ['send'], explicitIntent: true, hasPermission: true, availableCapabilities: ['chat_send'] },
  });
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.reasonCode, 'OPERATION_MISSING_PERMISSION');
});

test('a gate declaring requiredPermissions is USE once the exact named permission is granted (alongside intent and capability)', () => {
  const result = evaluateEligibility({
    skill: namedPermGatedSkill,
    task: {
      platform: 'codex',
      autoInvoke: false,
      requestedOperations: ['send'],
      explicitIntent: true,
      grantedPermissions: ['chat_send'],
      availableCapabilities: ['chat_send'],
    },
  });
  assert.equal(result.decision, 'USE');
});

// --- Phase 1.2 review round 2: content-approval gate. A publish-style
// operation can require that the exact approved text still matches the
// text about to be sent — any edit after approval must BLOCK, not rely on
// the caller remembering to translate that into a boolean. ---

const approvalGatedSkill = {
  skill_id: 'ush-approval-gated-example',
  status: 'VALIDATED',
  risk: 'L0',
  platforms: ['codex'],
  operationGates: {
    publish: {
      requiredCapabilities: ['chat_send'],
      requiredPermissions: ['chat_send'],
      requiresExplicitIntent: true,
      requiresApprovedContentMatch: true,
    },
  },
};

test('a requiresApprovedContentMatch gate BLOCKs when no content has been approved at all', () => {
  const result = evaluateEligibility({
    skill: approvalGatedSkill,
    task: {
      platform: 'codex',
      autoInvoke: false,
      requestedOperations: ['publish'],
      explicitIntent: true,
      grantedPermissions: ['chat_send'],
      availableCapabilities: ['chat_send'],
      currentContentHash: 'abc123',
      // approvedContentHash intentionally omitted
    },
  });
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.reasonCode, 'OPERATION_NO_APPROVED_CONTENT');
});

test('a requiresApprovedContentMatch gate BLOCKs when the current content hash no longer matches the approved hash (stale approval after a material edit)', () => {
  const result = evaluateEligibility({
    skill: approvalGatedSkill,
    task: {
      platform: 'codex',
      autoInvoke: false,
      requestedOperations: ['publish'],
      explicitIntent: true,
      grantedPermissions: ['chat_send'],
      availableCapabilities: ['chat_send'],
      approvedContentHash: 'abc123',
      currentContentHash: 'def456',
    },
  });
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.reasonCode, 'OPERATION_APPROVAL_STALE');
});

test('a requiresApprovedContentMatch gate is USE when the approved hash exactly matches the current content hash and every other gate is satisfied', () => {
  const result = evaluateEligibility({
    skill: approvalGatedSkill,
    task: {
      platform: 'codex',
      autoInvoke: false,
      requestedOperations: ['publish'],
      explicitIntent: true,
      grantedPermissions: ['chat_send'],
      availableCapabilities: ['chat_send'],
      approvedContentHash: 'abc123',
      currentContentHash: 'abc123',
    },
  });
  assert.equal(result.decision, 'USE');
});
