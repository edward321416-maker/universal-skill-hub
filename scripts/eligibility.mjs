/**
 * Deterministic eligibility filter — stage 1 of the two-stage router
 * (deterministic filter -> native semantic skill matching, see docs/DESIGN.md).
 * This stage never makes a semantic "does this skill fit the task" judgment;
 * it only rules skills IN or OUT based on machine-checkable facts: lifecycle
 * state, risk tier vs. invocation mode/permission, required vs. available
 * inputs/tools/capabilities/permissions, forbidden capability use, declared
 * conflicts, platform/project-scope compatibility, and project policy.
 *
 * Checks run in this order (each returns immediately on match):
 *   1. QUARANTINED lifecycle             — host/system safety, always wins
 *   2. Project Policy explicit skill block, or a denied operation against a
 *      protected resource                — Project Policy outranks Global Skill
 *   3. Declared skill conflicts          — two mutually exclusive skills for one task
 *   4. Platform compatibility
 *   5. Project scope mismatch            — SKIP, not BLOCK (just not applicable here)
 *   6. Missing required input/tool/capability/permission — fail-closed: an
 *      unstated availability list is treated as "nothing available", not as
 *      "assume it's fine"
 *   7. Per-operation gates (skill.operationGates) for any operation actually
 *      present in task.requestedOperations — independent of the skill's
 *      overall risk tier, so an L0 skill's risky operation (e.g. "send",
 *      "publish") can require intent/permission/capability without gating
 *      the skill's default read-only/drafting behavior
 *   8. Forbidden capability actually used by the task (not merely declared)
 *   9. L4 risk tier (no auto-invoke; requires informed confirmation)
 *   10. L3 risk tier (requires explicit intent + permission; never auto for
 *      an EXPERIMENTAL skill)
 *   11. DEPRECATED lifecycle             — SKIP, not BLOCK
 *
 * Every BLOCK/SKIP carries a `reasonCode` so callers can act on the decision
 * programmatically instead of string-matching `reasons`.
 */
export function evaluateEligibility({ skill, task, conflicts = [], projectPolicy = null }) {
  const reasons = [];

  if (skill.status === 'QUARANTINED') {
    return {
      decision: 'BLOCK',
      reasonCode: 'QUARANTINED',
      reasons: [`skill "${skill.skill_id}" is QUARANTINED and must never be invoked`],
    };
  }

  if (projectPolicy) {
    if (Array.isArray(projectPolicy.blockedSkillIds) && projectPolicy.blockedSkillIds.includes(skill.skill_id)) {
      return {
        decision: 'BLOCK',
        reasonCode: 'PROJECT_POLICY',
        reasons: [`project policy blocks skill "${skill.skill_id}"${projectPolicy.reason ? `: ${projectPolicy.reason}` : ''} — Project Policy outranks Global Skill`],
      };
    }

    const requestedOperations = (task && task.requestedOperations) || [];
    const targetResources = (task && task.targetResources) || [];
    const deniedOperations = projectPolicy.deniedOperations || [];
    const protectedResources = projectPolicy.protectedResources || [];
    const deniedOpHit = requestedOperations.find((op) => deniedOperations.includes(op));
    const protectedResourceHit = targetResources.find((r) => protectedResources.includes(r));
    if (deniedOpHit && protectedResourceHit) {
      return {
        decision: 'BLOCK',
        reasonCode: 'PROJECT_POLICY',
        reasons: [`project policy denies operation "${deniedOpHit}" against protected resource "${protectedResourceHit}"${projectPolicy.reason ? `: ${projectPolicy.reason}` : ''} — Project Policy outranks Global Skill`],
      };
    }
  }

  const selectedSkillIds = (task && task.selectedSkillIds) || [];
  const conflictingWith = selectedSkillIds.find((otherId) =>
    conflicts.some(
      (pair) =>
        (pair[0] === skill.skill_id && pair[1] === otherId) ||
        (pair[1] === skill.skill_id && pair[0] === otherId)
    )
  );
  if (conflictingWith) {
    return {
      decision: 'BLOCK',
      reasonCode: 'CONFLICTING_SKILL',
      reasons: [`skill "${skill.skill_id}" conflicts with already-selected skill "${conflictingWith}" for this task`],
    };
  }

  if (!skill.platforms.includes(task.platform)) {
    return {
      decision: 'BLOCK',
      reasonCode: 'PLATFORM_UNSUPPORTED',
      reasons: [`skill "${skill.skill_id}" does not list platform "${task.platform}" as supported`],
    };
  }

  if (skill.project_scope && skill.project_scope !== task.project) {
    return {
      decision: 'SKIP',
      reasonCode: 'PROJECT_SCOPE_MISMATCH',
      reasons: [`skill "${skill.skill_id}" is scoped to project "${skill.project_scope}", not applicable to task project "${task.project || '(none given)'}"`],
    };
  }

  const missingFrom = (required, available, label, code) => {
    if (!required || required.length === 0) return null;
    const have = available || []; // fail-closed: an unstated list means "nothing available"
    const missing = required.filter((item) => !have.includes(item));
    if (missing.length === 0) return null;
    return {
      decision: 'BLOCK',
      reasonCode: code,
      reasons: [`skill "${skill.skill_id}" requires ${label} "${missing.join(', ')}" not available/granted to this task`],
    };
  };

  const requiredChecks = [
    missingFrom(skill.required_inputs, task.availableInputs, 'input', 'MISSING_INPUT'),
    missingFrom(skill.required_tools, task.availableTools, 'tool', 'MISSING_TOOL'),
    missingFrom(skill.required_capabilities, task.availableCapabilities, 'capability', 'MISSING_CAPABILITY'),
    missingFrom(skill.required_permissions, task.grantedPermissions, 'permission', 'MISSING_PERMISSION'),
  ].filter(Boolean);
  if (requiredChecks.length > 0) return requiredChecks[0];

  // Per-operation gates: an otherwise low-risk skill (read-only analysis,
  // drafting) can still have one specific operation (e.g. "send",
  // "publish") that must independently require explicit intent,
  // permission, and capability — without forcing every invocation of the
  // skill through L3-style checks just because ONE of its operations is
  // risky. Only triggers for operations actually present in
  // task.requestedOperations; the skill's default behavior is unaffected.
  const requestedOps = (task && task.requestedOperations) || [];
  const operationGates = skill.operationGates || {};
  for (const op of requestedOps) {
    const gate = operationGates[op];
    if (!gate) continue;
    if (gate.requiresExplicitIntent && !task.explicitIntent) {
      return {
        decision: 'BLOCK',
        reasonCode: 'OPERATION_NO_EXPLICIT_INTENT',
        reasons: [`skill "${skill.skill_id}" operation "${op}" requires explicit user intent`],
      };
    }
    if (gate.requiresPermission && !task.hasPermission) {
      return {
        decision: 'BLOCK',
        reasonCode: 'OPERATION_NO_PERMISSION',
        reasons: [`skill "${skill.skill_id}" operation "${op}" requires explicit permission`],
      };
    }
    const missingCap = missingFrom(gate.requiredCapabilities, task.availableCapabilities, 'capability', 'OPERATION_MISSING_CAPABILITY');
    if (missingCap) {
      missingCap.reasons = [`skill "${skill.skill_id}" operation "${op}" requires capability not available/granted to this task`];
      return missingCap;
    }
  }

  const capabilitiesUsed = (task && task.capabilitiesUsed) || [];
  const forbidden = skill.forbidden_capabilities || [];
  const forbiddenHit = capabilitiesUsed.find((cap) => forbidden.includes(cap));
  if (forbiddenHit) {
    return {
      decision: 'BLOCK',
      reasonCode: 'FORBIDDEN_CAPABILITY',
      reasons: [`skill "${skill.skill_id}" would use forbidden capability "${forbiddenHit}"`],
    };
  }

  if (skill.risk === 'L4') {
    if (task.autoInvoke) {
      return {
        decision: 'BLOCK',
        reasonCode: 'L4_AUTO',
        reasons: [`skill "${skill.skill_id}" is risk tier L4 (destructive/high-consequence) and cannot be auto-invoked; it requires explicit informed confirmation`],
      };
    }
    if (!task.informedConfirmation) {
      return {
        decision: 'BLOCK',
        reasonCode: 'L4_NO_INFORMED_CONFIRMATION',
        reasons: [`skill "${skill.skill_id}" is risk tier L4 and requires explicit informed confirmation before use`],
      };
    }
  }

  if (skill.risk === 'L3') {
    if (skill.status === 'EXPERIMENTAL' && task.autoInvoke) {
      return {
        decision: 'BLOCK',
        reasonCode: 'EXPERIMENTAL_L3_AUTO',
        reasons: [`skill "${skill.skill_id}" is EXPERIMENTAL and risk tier L3 — an unproven skill cannot be auto-invoked for an external write/mutation`],
      };
    }
    if (!task.explicitIntent) {
      return {
        decision: 'BLOCK',
        reasonCode: 'L3_NO_EXPLICIT_INTENT',
        reasons: [`skill "${skill.skill_id}" is risk tier L3 (external write/API/GitHub mutation) and requires explicit user intent`],
      };
    }
    if (!task.hasPermission) {
      return {
        decision: 'BLOCK',
        reasonCode: 'L3_NO_PERMISSION',
        reasons: [`skill "${skill.skill_id}" is risk tier L3 and requires explicit permission before use`],
      };
    }
  }

  if (skill.status === 'DEPRECATED') {
    return { decision: 'SKIP', reasonCode: 'DEPRECATED', reasons: [`skill "${skill.skill_id}" is DEPRECATED`] };
  }

  return { decision: 'USE', reasonCode: 'ELIGIBLE', reasons };
}
