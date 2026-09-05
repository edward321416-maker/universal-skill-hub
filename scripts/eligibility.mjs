/**
 * Deterministic eligibility filter — stage 1 of the two-stage router
 * (deterministic filter -> native semantic skill matching, see docs/DESIGN.md).
 * This stage never makes a semantic "does this skill fit the task" judgment;
 * it only rules skills IN or OUT based on machine-checkable facts: lifecycle
 * state, risk tier vs. invocation mode/permission, forbidden capability use,
 * declared conflicts, platform compatibility, and project policy.
 *
 * Checks run in this order (each returns immediately on match):
 *   1. QUARANTINED lifecycle           — host/system safety, always wins
 *   2. Project Policy explicit block   — Project Policy outranks Global Skill
 *   3. Declared skill conflicts        — two mutually exclusive skills for one task
 *   4. Platform compatibility
 *   5. Forbidden capability actually used by the task (not merely declared)
 *   6. L4 risk tier (no auto-invoke; requires informed confirmation)
 *   7. L3 risk tier (requires explicit intent + permission; never auto for
 *      an EXPERIMENTAL skill)
 *   8. DEPRECATED lifecycle            — SKIP, not BLOCK
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

  if (projectPolicy && Array.isArray(projectPolicy.blockedSkillIds) && projectPolicy.blockedSkillIds.includes(skill.skill_id)) {
    return {
      decision: 'BLOCK',
      reasonCode: 'PROJECT_POLICY',
      reasons: [`project policy blocks skill "${skill.skill_id}"${projectPolicy.reason ? `: ${projectPolicy.reason}` : ''} — Project Policy outranks Global Skill`],
    };
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
