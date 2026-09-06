import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateEligibility } from '../eligibility.mjs';

/**
 * Cross-project project-policy fixtures, read-only sourced from the real
 * PUBLIC repositories named in the Phase 1.1 review request on
 * 2026-09-05. Each `protectedResources`/`deniedOperations` value below names
 * a concept that repository's own public README/docs already describes —
 * cited per fixture — not invented, and not copied verbatim from any
 * private or secret content (none of these repos expose any).
 *
 * The global skill under test, `ush-example-skill`, stands in for
 * `ush-repo-evidence-plan` (same shape: L0, read-only planning skill) so
 * these fixtures don't depend on that skill's exact registry entry.
 */
const globalReadOnlySkill = {
  skill_id: 'ush-example-skill',
  status: 'VALIDATED',
  risk: 'L0',
  platforms: ['codex', 'claude-code'],
};

test('FINAL CHECK: a protected-resource operation is BLOCKed by project policy even for an otherwise-eligible global skill', () => {
  // Source: edward321416-maker/final-check README — "Frozen source hash:
  // 4b506c3b692f2cef39e2be7cb44b4ce74bcc4ce829064ac655e16f545042bb11",
  // "frozen Validator v1.5", "Gold rewriting refuse after freeze".
  const finalCheckPolicy = {
    protectedResources: ['frozen_validator_v1_5', 'gold_fixtures'],
    deniedOperations: ['modify', 'rescore'],
    reason: 'FINAL CHECK: Validator v1.5 and Gold fixtures are frozen post-benchmark; see README "Frozen source hash" and TASK04 Gold-rewriting-refuses-after-freeze contract',
  };

  const readOnly = evaluateEligibility({
    skill: globalReadOnlySkill,
    task: { platform: 'codex', autoInvoke: false, requestedOperations: ['read'], targetResources: ['frozen_validator_v1_5'] },
    projectPolicy: finalCheckPolicy,
  });
  assert.equal(readOnly.decision, 'USE', 'reading the frozen validator should still be allowed for a read-only global skill');

  const attemptedModify = evaluateEligibility({
    skill: globalReadOnlySkill,
    task: { platform: 'codex', autoInvoke: false, requestedOperations: ['modify'], targetResources: ['frozen_validator_v1_5'] },
    projectPolicy: finalCheckPolicy,
  });
  assert.equal(attemptedModify.decision, 'BLOCK');
  assert.equal(attemptedModify.reasonCode, 'PROJECT_POLICY');
});

test('ONE ROPE (openbaeseongjin/baeseongjin): a generic global planning skill stays USE while a project-policy-protected file is preserved', () => {
  // Source: openbaeseongjin/baeseongjin repo root — SESSION-HANDOFF.md,
  // AGENTS.md, docs/development-rules.md all exist (verified via the
  // GitHub API during the Phase 1 migration of
  // .codex/skills/repo-task-plan/SKILL.md, which explicitly instructs
  // reading these before inspecting implementation details).
  const oneRopePolicy = {
    protectedResources: ['session_handoff'],
    deniedOperations: ['modify'],
    reason: 'ONE ROPE: SESSION-HANDOFF.md is the project handoff record of record; see openbaeseongjin/baeseongjin repo root',
  };

  const planningUse = evaluateEligibility({
    skill: globalReadOnlySkill,
    task: { platform: 'codex', autoInvoke: false, project: 'one-rope', requestedOperations: ['read'], targetResources: ['session_handoff'] },
    projectPolicy: oneRopePolicy,
  });
  assert.equal(planningUse.decision, 'USE');

  const modifyBlocked = evaluateEligibility({
    skill: globalReadOnlySkill,
    task: { platform: 'codex', autoInvoke: false, project: 'one-rope', requestedOperations: ['modify'], targetResources: ['session_handoff'] },
    projectPolicy: oneRopePolicy,
  });
  assert.equal(modifyBlocked.decision, 'BLOCK');
  assert.equal(modifyBlocked.reasonCode, 'PROJECT_POLICY');
});

test('DECODE: project policy precedence is preserved over a global skill for a LOCK CANDIDATE resource', () => {
  // Source: edward321416-maker/DECODE README — "Eight expert fields,
  // Core/Extended context, twelve principles and GO/STOP thresholds
  // remain LOCK CANDIDATE."
  const decodePolicy = {
    protectedResources: ['go_stop_thresholds'],
    deniedOperations: ['modify'],
    reason: 'DECODE: GO/STOP thresholds remain LOCK CANDIDATE per README',
  };

  const result = evaluateEligibility({
    skill: globalReadOnlySkill,
    task: { platform: 'codex', autoInvoke: false, project: 'decode', requestedOperations: ['modify'], targetResources: ['go_stop_thresholds'] },
    projectPolicy: decodePolicy,
  });
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.reasonCode, 'PROJECT_POLICY');
});

test('green-remodeling-map: a cold project with no project policy leaves a global L0 skill eligible', () => {
  // Source: edward321416-maker/green-remodeling-map top-level tree — a
  // plain app (app.js, ranking.js, data/, config/), no AGENTS.md/development
  // rules/policy docs of any kind. This is the cold-project reuse case:
  // no projectPolicy object exists to construct, so none is passed.
  const result = evaluateEligibility({
    skill: globalReadOnlySkill,
    task: { platform: 'codex', autoInvoke: false, project: 'green-remodeling-map', requestedOperations: ['read'], targetResources: ['ranking_data'] },
  });
  assert.equal(result.decision, 'USE');
});
